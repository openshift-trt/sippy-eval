import asyncio
import os
import tempfile
import urllib.error
from pathlib import Path
from unittest import mock

import pytest

from server import (
    REPO_ROOT,
    _data_mode,
    _default_database_dsn,
    _default_redis_url,
    _dsn_for_mode,
    _http_probe,
    _listen_base_url,
    _repo_path,
    _resolve_bigquery_creds,
    _validate_dsn,
    _validate_redis_url,
    _trim,
    _wait_for_ready,
    sippy_serve,
)


class TestRepoPath:
    def test_relative_path(self):
        result = _repo_path("config/views.yaml")
        assert result == (REPO_ROOT / "config" / "views.yaml").resolve()

    def test_nested_relative_path(self):
        result = _repo_path("a/b/c")
        assert result == (REPO_ROOT / "a" / "b" / "c").resolve()

    def test_dot_relative(self):
        result = _repo_path("./config/views.yaml")
        assert result == (REPO_ROOT / "config" / "views.yaml").resolve()

    def test_rejects_dotdot_escape(self):
        with pytest.raises(ValueError, match="path escapes repo root"):
            _repo_path("../etc/passwd")

    def test_rejects_nested_dotdot_escape(self):
        with pytest.raises(ValueError, match="path escapes repo root"):
            _repo_path("foo/../../..")

    def test_rejects_absolute_outside_repo(self):
        with pytest.raises(ValueError, match="path escapes repo root"):
            _repo_path("/etc/passwd")

    def test_absolute_inside_repo(self):
        inner = str(REPO_ROOT / "config" / "views.yaml")
        result = _repo_path(inner)
        assert result == Path(inner).resolve()

    def test_tilde_expansion_outside_repo(self):
        with pytest.raises(ValueError, match="path escapes repo root"):
            _repo_path("~/something")

    def test_repo_root_itself(self):
        result = _repo_path(str(REPO_ROOT))
        assert result == REPO_ROOT.resolve()

    def test_normalizes_redundant_slashes(self):
        result = _repo_path("config///views.yaml")
        assert result == (REPO_ROOT / "config" / "views.yaml").resolve()

    def test_normalizes_inner_dotdot(self):
        result = _repo_path("config/../config/views.yaml")
        assert result == (REPO_ROOT / "config" / "views.yaml").resolve()


class TestTrim:
    def test_short_string_unchanged(self):
        assert _trim("hello") == "hello"

    def test_at_limit_unchanged(self):
        s = "x" * 100
        assert _trim(s, max_len=100) == s

    def test_over_limit_truncated(self):
        s = "A" * 30000
        result = _trim(s, max_len=1000)
        assert len(result) < len(s)
        assert "characters omitted" in result
        head = 500
        tail = 1000 - 500 - 120
        assert result.startswith("A" * head)
        assert result.endswith("A" * tail)

    def test_omission_count_correct(self):
        s = "x" * 30000
        result = _trim(s, max_len=1000)
        head = 500
        tail = 1000 - 500 - 120
        expected_omitted = 30000 - head - tail
        assert str(expected_omitted) in result


class TestResolveBigqueryCreds:
    def test_explicit_path_exists(self):
        with tempfile.NamedTemporaryFile(suffix=".json") as f:
            path, err = _resolve_bigquery_creds(f.name)
            assert err is None
            assert path == Path(f.name).resolve()

    def test_explicit_path_missing(self):
        path, err = _resolve_bigquery_creds("/nonexistent/creds.json")
        assert path is None
        assert "not found" in err

    def test_env_var_fallback(self):
        with tempfile.NamedTemporaryFile(suffix=".json") as f:
            with mock.patch.dict(
                os.environ,
                {"SIPPY_BIGQUERY_CREDENTIALS_FILE": f.name},
                clear=False,
            ):
                path, err = _resolve_bigquery_creds(None)
                assert err is None
                assert path == Path(f.name).resolve()

    def test_env_var_second_fallback(self):
        with tempfile.NamedTemporaryFile(suffix=".json") as f:
            env = {
                "GOOGLE_APPLICATION_CREDENTIALS": f.name,
            }
            with mock.patch.dict(os.environ, env, clear=False):
                os.environ.pop("SIPPY_BIGQUERY_CREDENTIALS_FILE", None)
                path, err = _resolve_bigquery_creds(None)
                assert err is None
                assert path == Path(f.name).resolve()

    def test_env_var_file_missing(self):
        with mock.patch.dict(
            os.environ,
            {"SIPPY_BIGQUERY_CREDENTIALS_FILE": "/nonexistent/sa.json"},
            clear=False,
        ):
            path, err = _resolve_bigquery_creds(None)
            assert path is None
            assert "SIPPY_BIGQUERY_CREDENTIALS_FILE" in err
            assert "not found" in err

    def test_no_creds_anywhere(self):
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("SIPPY_BIGQUERY_CREDENTIALS_FILE", None)
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            path, err = _resolve_bigquery_creds(None)
            assert path is None
            assert "Set bigquery_credentials_file" in err

    def test_explicit_overrides_env(self):
        with tempfile.NamedTemporaryFile(suffix=".json") as explicit:
            with tempfile.NamedTemporaryFile(suffix=".json") as env_file:
                with mock.patch.dict(
                    os.environ,
                    {"SIPPY_BIGQUERY_CREDENTIALS_FILE": env_file.name},
                    clear=False,
                ):
                    path, err = _resolve_bigquery_creds(explicit.name)
                    assert err is None
                    assert path == Path(explicit.name).resolve()

    def test_first_env_var_takes_priority(self):
        with tempfile.NamedTemporaryFile(suffix=".json") as first:
            with tempfile.NamedTemporaryFile(suffix=".json") as second:
                env = {
                    "SIPPY_BIGQUERY_CREDENTIALS_FILE": first.name,
                    "GOOGLE_APPLICATION_CREDENTIALS": second.name,
                }
                with mock.patch.dict(os.environ, env, clear=False):
                    path, err = _resolve_bigquery_creds(None)
                    assert err is None
                    assert path == Path(first.name).resolve()


class TestDataMode:
    def _patch_dotenv(self, vals):
        return mock.patch("server.dotenv_values", return_value=vals)

    def test_default_is_seed(self):
        with self._patch_dotenv({}):
            assert _data_mode() == "seed"

    def test_seed_mode(self):
        with self._patch_dotenv({"SIPPY_DATA_MODE": "seed"}):
            assert _data_mode() == "seed"

    def test_prod_like_mode(self):
        with self._patch_dotenv({"SIPPY_DATA_MODE": "prod-like"}):
            assert _data_mode() == "prod-like"

    def test_invalid_mode_falls_back_to_seed(self):
        with self._patch_dotenv({"SIPPY_DATA_MODE": "invalid"}):
            assert _data_mode() == "seed"

    def test_case_insensitive(self):
        with self._patch_dotenv({"SIPPY_DATA_MODE": "PROD-LIKE"}):
            assert _data_mode() == "prod-like"

    def test_no_env_file(self):
        with mock.patch("server._DEVCONTAINER_ENV") as mock_path:
            mock_path.is_file.return_value = False
            assert _data_mode() == "seed"


class TestDsnForMode:
    def test_seed_mode_default(self):
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("SIPPY_SEED_DATABASE_DSN", None)
            os.environ.pop("SIPPY_DATABASE_DSN", None)
            assert _dsn_for_mode("seed") == "postgresql://postgres:password@localhost:5432/postgres"

    def test_seed_mode_from_env(self):
        with mock.patch.dict(
            os.environ, {"SIPPY_SEED_DATABASE_DSN": "postgresql://custom/seed"}, clear=False
        ):
            assert _dsn_for_mode("seed") == "postgresql://custom/seed"

    def test_seed_mode_falls_back_to_sippy_database_dsn(self):
        with mock.patch.dict(
            os.environ, {"SIPPY_DATABASE_DSN": "postgresql://legacy/db"}, clear=False
        ):
            os.environ.pop("SIPPY_SEED_DATABASE_DSN", None)
            assert _dsn_for_mode("seed") == "postgresql://legacy/db"

    def test_prod_like_mode_default(self):
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("SIPPY_PRODLIKE_DATABASE_DSN", None)
            assert (
                _dsn_for_mode("prod-like")
                == "postgresql://postgres:password@localhost:5432/prodlike"
            )

    def test_prod_like_mode_from_env(self):
        with mock.patch.dict(
            os.environ,
            {"SIPPY_PRODLIKE_DATABASE_DSN": "postgresql://custom/prodlike"},
            clear=False,
        ):
            assert _dsn_for_mode("prod-like") == "postgresql://custom/prodlike"


class TestValidateDsn:
    def test_valid_dsn(self):
        assert _validate_dsn("postgresql://postgres:password@localhost:5432/postgres") is None

    def test_invalid_scheme(self):
        assert _validate_dsn("mysql://localhost/db") is not None

    def test_empty_string(self):
        assert _validate_dsn("") is not None

    def test_shell_metacharacters(self):
        assert _validate_dsn("postgresql://x; rm -rf /") is not None

    def test_whitespace_rejected(self):
        assert _validate_dsn("postgresql://ok\nnewline") is not None


class TestValidateRedisUrl:
    def test_valid_redis(self):
        assert _validate_redis_url("redis://localhost:6379") is None

    def test_valid_rediss(self):
        assert _validate_redis_url("rediss://secure:6380/0") is None

    def test_invalid_scheme(self):
        assert _validate_redis_url("http://localhost:6379") is not None

    def test_empty_string(self):
        assert _validate_redis_url("") is not None

    def test_shell_metacharacters(self):
        assert _validate_redis_url("redis://x$(whoami)") is None  # no whitespace, exec-safe

    def test_whitespace_rejected(self):
        assert _validate_redis_url("redis://ok \t") is not None


class TestDefaults:
    def test_database_dsn_default(self):
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("SIPPY_DATABASE_DSN", None)
            assert _default_database_dsn() == "postgresql://postgres:password@localhost:5432/postgres"

    def test_database_dsn_from_env(self):
        with mock.patch.dict(
            os.environ, {"SIPPY_DATABASE_DSN": "postgresql://other:5433/db"}, clear=False
        ):
            assert _default_database_dsn() == "postgresql://other:5433/db"

    def test_redis_url_default(self):
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("REDIS_URL", None)
            assert _default_redis_url() == "redis://localhost:6379"

    def test_redis_url_from_env(self):
        with mock.patch.dict(
            os.environ, {"REDIS_URL": "redis://other:6380"}, clear=False
        ):
            assert _default_redis_url() == "redis://other:6380"


class TestListenBaseUrl:
    def test_port_only(self):
        assert _listen_base_url(":8080") == "http://127.0.0.1:8080"

    def test_wildcard_host(self):
        assert _listen_base_url("0.0.0.0:8080") == "http://127.0.0.1:8080"

    def test_ipv6_wildcard(self):
        assert _listen_base_url("[::]:8080") == "http://127.0.0.1:8080"

    def test_explicit_host(self):
        assert _listen_base_url("localhost:9000") == "http://localhost:9000"

    def test_already_a_url(self):
        assert _listen_base_url("http://sippy.local:8080/") == "http://sippy.local:8080"

    def test_no_port(self):
        assert _listen_base_url("sippy.local") == "http://sippy.local"


class TestHttpProbe:
    URL = "http://127.0.0.1:8080/api/releases"

    def test_responding_endpoint(self):
        resp = mock.MagicMock()
        resp.status = 200
        with mock.patch("server.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value = resp
            assert _http_probe(self.URL) == (True, "HTTP 200")

    def test_connection_refused(self):
        with mock.patch("server.urllib.request.urlopen", side_effect=OSError("refused")):
            responding, detail = _http_probe(self.URL)
        assert responding is False
        assert "refused" in detail

    def test_http_error_is_not_ready(self):
        err = urllib.error.HTTPError("http://x", 404, "Not Found", {}, None)
        with mock.patch("server.urllib.request.urlopen", side_effect=err):
            assert _http_probe(self.URL) == (False, "HTTP 404")

    def test_server_error_is_not_ready(self):
        err = urllib.error.HTTPError("http://x", 500, "Boom", {}, None)
        with mock.patch("server.urllib.request.urlopen", side_effect=err):
            assert _http_probe(self.URL) == (False, "HTTP 500")


class TestWaitForReady:
    URL = "http://127.0.0.1:8080/api/releases"

    def test_ready_immediately(self):
        with mock.patch("server._http_probe", return_value=(True, "HTTP 200")):
            assert asyncio.run(_wait_for_ready(self.URL, 30)) is None

    def test_probes_once_with_zero_timeout(self):
        with mock.patch("server._http_probe", return_value=(True, "HTTP 200")) as probe:
            assert asyncio.run(_wait_for_ready(self.URL, 0)) is None
            assert probe.call_count == 1

    def test_times_out_without_process(self):
        with mock.patch("server._http_probe", return_value=(False, "refused")):
            err = asyncio.run(_wait_for_ready(self.URL, 0))
        assert "API not responding" in err
        assert self.URL in err

    def test_becomes_ready_after_retries(self):
        probe = mock.Mock(side_effect=[(False, "refused"), (False, "refused"), (True, "HTTP 200")])

        async def _no_sleep(_):
            return None

        with mock.patch("server._http_probe", probe):
            with mock.patch("server.asyncio.sleep", _no_sleep):
                assert asyncio.run(_wait_for_ready(self.URL, 30)) is None
        assert probe.call_count == 3

    def test_process_death_aborts_wait(self):
        proc = mock.Mock()
        proc.poll.return_value = 2
        with mock.patch("server._http_probe", return_value=(False, "refused")) as probe:
            err = asyncio.run(_wait_for_ready(self.URL, 30, proc))
        assert "exit 2" in err
        assert probe.call_count == 0

    def test_live_process_still_waits(self):
        proc = mock.Mock()
        proc.poll.return_value = None
        with mock.patch("server._http_probe", return_value=(True, "HTTP 200")):
            assert asyncio.run(_wait_for_ready(self.URL, 30, proc)) is None

    def test_subject_appears_in_error(self):
        with mock.patch("server._http_probe", return_value=(False, "refused")):
            err = asyncio.run(_wait_for_ready(self.URL, 0, subject="dev server"))
        assert err.startswith("dev server not responding")


class TestSippyServeReadiness:
    """TRT-2678: a detected process must not be reported as ready on its own."""

    API_URL = "http://127.0.0.1:8080/api/releases"

    def _serve(self, **kwargs):
        kwargs.setdefault("views_file", "config/seed-views.yaml")
        kwargs.setdefault("data_provider", "postgres")
        return asyncio.run(sippy_serve(**kwargs))

    def test_existing_process_reported_ready_only_after_api_responds(self):
        with mock.patch("server._pids_sippy_serve", return_value=[4242]):
            with mock.patch("server._http_probe", return_value=(True, "HTTP 200")) as probe:
                out = self._serve(ready_timeout_seconds=30)
        probe.assert_called_with(self.API_URL)
        assert "already running, ready" in out
        assert "pid(s) 4242" in out

    def test_existing_process_with_dead_api_is_an_error(self):
        async def _no_sleep(_):
            return None

        with mock.patch("server._pids_sippy_serve", return_value=[4242]):
            with mock.patch("server._http_probe", return_value=(False, "refused")):
                with mock.patch("server.asyncio.sleep", _no_sleep):
                    out = self._serve(ready_timeout_seconds=1)
        assert "API not responding" in out
        assert self.API_URL in out
        assert "already running, ready" not in out
        assert "Do not start the frontend yet" in out

    def test_zero_timeout_skips_probe_and_does_not_claim_ready(self):
        with mock.patch("server._pids_sippy_serve", return_value=[4242]):
            with mock.patch("server._http_probe", return_value=(False, "refused")) as probe:
                out = self._serve(ready_timeout_seconds=0)
        probe.assert_not_called()
        assert "readiness not checked" in out

    def test_probe_url_follows_listen_flag(self):
        with mock.patch("server._pids_sippy_serve", return_value=[1]):
            with mock.patch("server._http_probe", return_value=(True, "HTTP 200")) as probe:
                self._serve(listen="0.0.0.0:9999", ready_timeout_seconds=30)
        probe.assert_called_with("http://127.0.0.1:9999/api/releases")
