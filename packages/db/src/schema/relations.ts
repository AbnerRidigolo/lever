import { relations } from 'drizzle-orm';

import { apiKeys } from './api-keys.js';
import { auditLog } from './audit.js';
import { configVersions } from './config-versions.js';
import { experimentEnvironments, experiments, experimentVariants } from './experiments.js';
import { flagEnvironments, flags } from './flags.js';
import { environments, projectMembers, projects } from './projects.js';
import { segments } from './segments.js';
import { users } from './users.js';

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(projectMembers),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  environments: many(environments),
  segments: many(segments),
  flags: many(flags),
  experiments: many(experiments),
  auditLog: many(auditLog),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, { fields: [environments.projectId], references: [projects.id] }),
  apiKeys: many(apiKeys),
  flagEnvironments: many(flagEnvironments),
  experimentEnvironments: many(experimentEnvironments),
  configVersions: many(configVersions),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  environment: one(environments, {
    fields: [apiKeys.environmentId],
    references: [environments.id],
  }),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  project: one(projects, { fields: [segments.projectId], references: [projects.id] }),
}));

export const flagsRelations = relations(flags, ({ one, many }) => ({
  project: one(projects, { fields: [flags.projectId], references: [projects.id] }),
  environments: many(flagEnvironments),
}));

export const flagEnvironmentsRelations = relations(flagEnvironments, ({ one }) => ({
  flag: one(flags, { fields: [flagEnvironments.flagId], references: [flags.id] }),
  environment: one(environments, {
    fields: [flagEnvironments.environmentId],
    references: [environments.id],
  }),
  segment: one(segments, { fields: [flagEnvironments.segmentId], references: [segments.id] }),
}));

export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  project: one(projects, { fields: [experiments.projectId], references: [projects.id] }),
  segment: one(segments, { fields: [experiments.segmentId], references: [segments.id] }),
  variants: many(experimentVariants),
  environments: many(experimentEnvironments),
}));

export const experimentVariantsRelations = relations(experimentVariants, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentVariants.experimentId],
    references: [experiments.id],
  }),
}));

export const experimentEnvironmentsRelations = relations(experimentEnvironments, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentEnvironments.experimentId],
    references: [experiments.id],
  }),
  environment: one(environments, {
    fields: [experimentEnvironments.environmentId],
    references: [environments.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  project: one(projects, { fields: [auditLog.projectId], references: [projects.id] }),
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}));

export const configVersionsRelations = relations(configVersions, ({ one }) => ({
  environment: one(environments, {
    fields: [configVersions.environmentId],
    references: [environments.id],
  }),
}));
