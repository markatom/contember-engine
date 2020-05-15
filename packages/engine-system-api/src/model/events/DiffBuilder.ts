import { DependencyBuilder } from './DependencyBuilder'
import { DiffErrorCode } from '../../schema'
import { Stage } from '../dtos'
import { ContentEvent } from '@contember/engine-common'
import { DiffCountQuery, DiffQuery } from '../queries'
import {
	EventPermission,
	EventsPermissionsVerifier,
	EventsPermissionsVerifierContext,
} from './EventsPermissionsVerifier'
import { assertEveryIsContentEvent } from './eventUtils'
import { DatabaseContext } from '../database'
import { SchemaVersionBuilder } from '../migrations'
import { EntitiesResult, EntitiesSelector, EntitiesSelectorInput } from '../content/EntitiesSelector'
import { Schema } from '@contember/schema'
import { formatSchemaName } from '../helpers'
import { filterSchemaByStage } from '@contember/schema-utils'

export class DiffBuilder {
	constructor(
		private readonly dependencyBuilder: DependencyBuilder,
		private readonly permissionsVerifier: EventsPermissionsVerifier,
		private readonly schemaVersionBuilder: SchemaVersionBuilder,
		private readonly entitiesSelector: EntitiesSelector,
	) {}

	public async build(
		db: DatabaseContext,
		permissionContext: EventsPermissionsVerifierContext,
		baseStage: Stage,
		headStage: Stage,
		filter: ReadonlyArray<EventFilter> | null,
	): Promise<DiffBuilderResponseResponse> {
		const count = await db.queryHandler.fetch(new DiffCountQuery(baseStage.event_id, headStage.event_id))

		if (count.ok === false) {
			return count
		}

		if (count.diff === 0) {
			return {
				ok: true,
				events: [],
			}
		}

		const events = await db.queryHandler.fetch(new DiffQuery(baseStage.event_id, headStage.event_id))
		assertEveryIsContentEvent(events)
		const schema = await this.schemaVersionBuilder.buildSchema(db)
		const dependencies = await this.dependencyBuilder.build(schema, events)
		const eventsWithDependencies = events.map(it => ({
			...it,
			dependencies: dependencies[it.id] || [],
		}))

		const filteredEvents =
			filter !== null
				? await this.filterEvents(eventsWithDependencies, permissionContext, db, schema, baseStage, headStage, filter)
				: eventsWithDependencies

		const permissions = await this.permissionsVerifier.verify(
			db,
			permissionContext,
			headStage,
			baseStage,
			filteredEvents,
		)

		return {
			ok: true,
			events: filteredEvents.map(event => ({
				...event,
				permission: permissions[event.id],
			})),
		}
	}

	private async filterEvents(
		events: EventWithDependencies[],
		permissionContext: EventsPermissionsVerifierContext,
		db: DatabaseContext,
		schema: Schema,
		baseStage: Stage,
		headStage: Stage,
		filter: ReadonlyArray<EventFilter>,
	): Promise<EventWithDependencies[]> {
		if (filter.length === 0) {
			return []
		}
		const baseEntities = await this.fetchAffectedEntities(db, permissionContext, schema, baseStage, filter)
		const headEntities = await this.fetchAffectedEntities(db, permissionContext, schema, headStage, filter)
		const allIds = [...baseEntities, ...headEntities]

		const rootEvents: ContentEvent[] = events.filter(it => it.rowId.some(id => allIds.includes(id)))
		const eventIds = new Set<string>([])
		const dependenciesMap: { [id: string]: string[] } = events.reduce(
			(acc, event) => ({ ...acc, [event.id]: event.dependencies }),
			{},
		)
		const collectDependencies = (ids: string[]) => {
			ids.forEach(id => {
				if (eventIds.has(id)) {
					return
				}
				eventIds.add(id)
				collectDependencies(dependenciesMap[id] || [])
			})
		}
		const rootEventIds = rootEvents.map(it => it.id)
		collectDependencies(rootEventIds)

		return events.filter(it => eventIds.has(it.id))
	}

	private async fetchAffectedEntities(
		db: DatabaseContext,
		permissionContext: EventsPermissionsVerifierContext,
		schema: Schema,
		stage: Stage,
		filter: readonly EventFilter[],
	): Promise<string[]> {
		const affectedEntities = await Promise.all(
			filter.map(
				async it =>
					await this.entitiesSelector.getEntities(
						{
							db: db.client.forSchema(formatSchemaName(stage)),
							schema: filterSchemaByStage(schema, stage.slug),
							identityVariables: permissionContext.variables,
							roles: permissionContext.identity.roles,
						},
						it,
					),
			),
		)
		const collectIds = (result: EntitiesResult): string[] => {
			const { id, ...rest } = result
			return [
				id,
				...Object.values(rest).flatMap(it => {
					if (!it) {
						return []
					}
					if (Array.isArray(it)) {
						return it.flatMap(collectIds)
					}
					return collectIds(it)
				}),
			]
		}
		return affectedEntities.flatMap(it => (it ? collectIds(it) : [])).filter(it => it !== null)
	}
}

export type DiffBuilderResponseResponse = DiffBuilderOkResponse | DiffBuilderErrorResponse

export class DiffBuilderErrorResponse {
	public readonly ok: false = false

	constructor(public readonly errors: DiffErrorCode[]) {}
}

export type EventWithMeta = ContentEvent & { dependencies: string[]; permission: EventPermission }
export type EventWithDependencies = ContentEvent & { dependencies: string[] }

export class DiffBuilderOkResponse {
	public readonly ok: true = true

	constructor(public readonly events: EventWithMeta[]) {}
}

export type EventFilter = EntitiesSelectorInput
