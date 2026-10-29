-- FR-008: notify listeners (services/decision) when a configuration version is published.
-- Channel and payload are defined in @lever/schemas (CONFIG_CHANGES_CHANNEL and
-- configChangeNotificationSchema). NOTIFY is delivered only when the transaction commits.
CREATE FUNCTION "config_versions_notify"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'lever_config_changes',
    json_build_object('environmentId', NEW.environment_id, 'version', NEW.version)::text
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "config_versions_notify_after_insert"
  AFTER INSERT ON "config_versions"
  FOR EACH ROW EXECUTE FUNCTION "config_versions_notify"();
