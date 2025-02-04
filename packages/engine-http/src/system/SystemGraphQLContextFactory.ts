import { Identity, SystemContainer } from '@contember/engine-system-api'
import { SystemGraphQLContext } from './SystemGraphQLHandlerFactory'
import { AuthResult } from '../common'
import { KoaContext } from '../application'
import { GraphQLKoaState } from '../graphql'
import { Acl } from '@contember/schema'
import { ProjectContainer } from '../project'

export class SystemGraphQLContextFactory {
	public async create({ authResult, memberships, koaContext, projectContainer, systemContainer, onClearCache }: {
		authResult: AuthResult
		memberships: readonly Acl.Membership[]
		koaContext: KoaContext<GraphQLKoaState>
		projectContainer: ProjectContainer
		systemContainer: SystemContainer
		onClearCache: () => void
	}): Promise<SystemGraphQLContext> {
		const identity = new Identity(
			authResult.identityId,
			memberships.map(it => it.role),
		)

		const dbContext = projectContainer.systemDatabaseContext
		const schema = await projectContainer.contentSchemaResolver.getSchema(dbContext)
		const systemContext = await systemContainer.resolverContextFactory.create(
			schema,
			dbContext,
			projectContainer.project,
			identity,
		)
		return {
			...systemContext,
			onClearCache,
			koaContext,
		}
	}
}
