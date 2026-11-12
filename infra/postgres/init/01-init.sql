-- PostgreSQL 컨테이너 첫 실행 때 한 번만 실행된다 (볼륨이 비어 있을 때).
-- imagine_dev 는 POSTGRES_DB 로 이미 만들어진다.

CREATE DATABASE imagine_test;

\connect imagine_dev
CREATE EXTENSION IF NOT EXISTS vector;

\connect imagine_test
CREATE EXTENSION IF NOT EXISTS vector;
