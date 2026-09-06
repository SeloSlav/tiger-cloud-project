-- Transactional regression: test identities and rows disappear on ROLLBACK.
BEGIN;
INSERT INTO frostline.zones(id,name,cargo) VALUES('TEST-LIVE','SQL regression','Synthetic');
INSERT INTO frostline_live.sensors SELECT 'TEST-LIVE-'||n,'TEST-LIVE',n FROM generate_series(1,4) n;
DO $$
DECLARE t timestamptz := date_trunc('minute',now())+INTERVAL '1 day'; n integer;
BEGIN
  INSERT INTO frostline_live.readings
    SELECT tick,'TEST-LIVE-'||s,'TEST-LIVE',7
    FROM generate_series(t,t+INTERVAL '1 minute',INTERVAL '1 minute') tick CROSS JOIN generate_series(1,4) s;
  CALL frostline_live.evaluate_incidents(t+INTERVAL '1 minute');
  SELECT count(*) INTO n FROM frostline_live.incidents WHERE zone_id='TEST-LIVE';
  IF n<>0 THEN RAISE EXCEPTION 'Two readings opened an incident too early'; END IF;

  INSERT INTO frostline_live.readings SELECT t+INTERVAL '2 minutes','TEST-LIVE-'||s,'TEST-LIVE',7 FROM generate_series(1,4) s;
  CALL frostline_live.evaluate_incidents(t+INTERVAL '2 minutes');
  CALL frostline_live.evaluate_incidents(t+INTERVAL '2 minutes');
  SELECT count(*) INTO n FROM frostline_live.incidents WHERE zone_id='TEST-LIVE' AND resolved_at IS NULL;
  IF n<>1 THEN RAISE EXCEPTION 'Sustained warming did not open exactly one incident'; END IF;

  INSERT INTO frostline_live.readings SELECT t+INTERVAL '3 minutes','TEST-LIVE-'||s,'TEST-LIVE',3 FROM generate_series(1,3) s;
  CALL frostline_live.evaluate_incidents(t+INTERVAL '3 minutes');
  INSERT INTO frostline_live.readings SELECT t+INTERVAL '4 minutes','TEST-LIVE-'||s,'TEST-LIVE',3 FROM generate_series(1,4) s;
  CALL frostline_live.evaluate_incidents(t+INTERVAL '4 minutes');
  SELECT count(*) INTO n FROM frostline_live.incidents WHERE zone_id='TEST-LIVE' AND resolved_at IS NULL;
  IF n<>1 THEN RAISE EXCEPTION 'Missing readings falsely implied recovery'; END IF;

  INSERT INTO frostline_live.readings SELECT t+INTERVAL '5 minutes','TEST-LIVE-'||s,'TEST-LIVE',3 FROM generate_series(1,4) s;
  CALL frostline_live.evaluate_incidents(t+INTERVAL '5 minutes');
  SELECT count(*) INTO n FROM frostline_live.incidents WHERE zone_id='TEST-LIVE' AND resolved_at=t+INTERVAL '5 minutes';
  IF n<>1 THEN RAISE EXCEPTION 'Two complete cool readings did not resolve the incident'; END IF;
END $$;
ROLLBACK;
