import { Acl, Input, Model } from '@contember/schema'
import { Mapper } from '../../Mapper'
import { RelationFetcher } from '../RelationFetcher'
import { SelectExecutionHandlerContext } from '../SelectExecutionHandler'
import { PredicateFactory } from '../../../acl'
import { WhereBuilder } from '../WhereBuilder'

export class FieldsVisitor implements Model.RelationByTypeVisitor<void>, Model.ColumnVisitor<void> {
	constructor(
		private readonly schema: Model.Schema,
		private readonly relationFetcher: RelationFetcher,
		private readonly predicateFactory: PredicateFactory,
		private readonly whereBuilder: WhereBuilder,
		private readonly mapper: Mapper,
		private readonly executionContext: SelectExecutionHandlerContext,
		private readonly relationPath: Model.AnyRelationContext[],
	) {}

	visitColumn({ entity, column }: Model.ColumnContext): void {
		const columnPath = this.executionContext.path
		const fieldPredicate = this.predicateFactory.getFieldPredicate(entity, Acl.Operation.read, column.name)
		const tableAlias = columnPath.back().alias
		const columnAlias = columnPath.alias

		if (fieldPredicate.predicate === false) {
			this.executionContext.addColumn({
				valueGetter: () => null,
			})
			return
		}

		this.executionContext.addColumn({
			query: qb => qb.select([tableAlias, column.columnName], columnAlias),
			predicate: !fieldPredicate.isSameAsPrimary
				? fieldPredicate.predicate
				: undefined,
		})
	}

	public visitManyHasManyInverse(relationContext: Model.ManyHasManyInverseContext): void {
		const field = this.executionContext.objectNode
		if (!field) {
			throw new Error()
		}
		this.executionContext.addData(
			relationContext.entity.primary,
			async ids =>
				this.relationFetcher.fetchManyHasManyGroups(
					{
						mapper: this.mapper,
						field: field,
						relationContext,
						relationPath: this.relationPath,
						ids: ids,
					},
				),
			[],
		)
	}

	public visitManyHasManyOwning(relationContext: Model.ManyHasManyOwningContext): void {
		const field = this.executionContext.objectNode
		if (!field) {
			throw new Error()
		}

		this.executionContext.addData(
			relationContext.entity.primary,
			async ids =>
				this.relationFetcher.fetchManyHasManyGroups({
					mapper: this.mapper,
					field: field,
					relationContext,
					relationPath: this.relationPath,
					ids: ids,
				}),
			[],
		)
	}

	public visitOneHasMany(relationContext: Model.OneHasManyContext): void {
		const field = this.executionContext.objectNode
		if (!field) {
			throw new Error()
		}

		this.executionContext.addData(
			relationContext.entity.primary,
			async ids =>
				this.relationFetcher.fetchOneHasManyGroups({
					mapper: this.mapper,
					objectNode: field,
					relationContext,
					relationPath: this.relationPath,
					ids: ids,
				}),
			[],
		)
	}

	public visitOneHasOneInverse(relationContext: Model.OneHasOneInverseContext): void {
		const { entity, targetRelation, targetEntity } = relationContext
		this.executionContext.addData(
			entity.primary,
			async ids => {
				const idsWhere: Input.Where = {
					[targetRelation.name]: {
						[entity.primary]: {
							in: ids,
						},
					},
				}
				const field = this.executionContext.objectNode
				if (!field) {
					throw new Error()
				}
				const where: Input.Where = {
					and: [idsWhere, field.args.filter].filter((it): it is Input.Where => it !== undefined),
				}
				const objectWithWhere = field.withArg('filter', where)

				return this.mapper.selectAssoc(targetEntity, objectWithWhere, [
					...this.relationPath,
					relationContext,
				], targetRelation.name)
			},
			null,
		)
	}

	public visitOneHasOneOwning(relationContext: Model.OneHasOneOwningContext): void {
		const { relation, targetEntity } = relationContext
		this.executionContext.addData(
			relation.name,
			async ids => {
				const idsWhere: Input.Where = {
					[targetEntity.primary]: {
						in: ids,
					},
				}
				const objectNode = this.executionContext.objectNode
				if (!objectNode) {
					throw new Error()
				}
				const where: Input.Where = {
					and: [idsWhere, objectNode.args.filter].filter((it): it is Input.Where => it !== undefined),
				}
				const objectWithWhere = objectNode.withArg('filter', where)

				return this.mapper.selectAssoc(targetEntity, objectWithWhere, [
					...this.relationPath,
					relationContext,
				], targetEntity.primary)
			},
			null,
		)
	}

	public visitManyHasOne(relationContext: Model.ManyHasOneContext): void {
		const { relation, targetEntity } = relationContext
		this.executionContext.addData(
			relation.name,
			async ids => {
				const idsWhere: Input.Where = {
					[targetEntity.primary]: {
						in: ids,
					},
				}
				const objectNode = this.executionContext.objectNode
				if (!objectNode) {
					throw new Error()
				}
				const where: Input.Where = {
					and: [idsWhere, objectNode.args.filter].filter((it): it is Input.Where => it !== undefined),
				}
				const objectWithWhere = objectNode.withArg('filter', where)

				return this.mapper.selectAssoc(targetEntity, objectWithWhere, [
					...this.relationPath,
					relationContext,
				], targetEntity.primary)
			},
			null,
		)
	}
}
