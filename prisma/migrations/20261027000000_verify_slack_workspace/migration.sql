-- Legacy config.teamId values are unverified and must not be backfilled.
ALTER TABLE "integrations"
  ADD COLUMN "slackTeamId" TEXT,
  ADD COLUMN "slackConnectionCodeHash" TEXT,
  ADD COLUMN "slackConnectionExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "integrations_slackTeamId_key" ON "integrations"("slackTeamId");
CREATE UNIQUE INDEX "integrations_slackConnectionCodeHash_key" ON "integrations"("slackConnectionCodeHash");
