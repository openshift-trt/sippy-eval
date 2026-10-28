import asyncio
import os
import tempfile
import urllib.error
from pathlib import Path
from unittest import mock

import pytest

import server
from server import (
    REPO_ROOT,
    _data_mode,
    _default_database_dsn,
    _default_redis_url,
    _dsn_for_mode,
    _listen_url,
    _repo_path,
    _resolve_bigquery_creds,
    _validate_dsn,
    _validate_redis_url,
    _wait_for_ready,
    _trim,
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


@pytest.mark.parametrize(
    "listen, expected",
    [
        (":8080", "http://127.0.0.1:8080"),
        ("127.0.0.1:9000", "http://127.0.0.1:9000"),
        ("localhost:8080", "http://localhost:8080"),
        ("0.0.0.0:8080", "http://127.0.0.1:8080"),
        ("[::]:8080", "http://[::1]:8080"),
        ("[::1]:9000", "http://[::1]:9000"),
    ],
)
def test_listen_url(listen, expected):
    assert _listen_url(listen) == expected


class TestWaitForReady:
    @pytest.mark.parametrize("existing", [False, True])
    def test_retries_connection_and_http_errors_until_success(self, existing):
        url = "http://127.0.0.1:8080/api/releases"
        response = mock.MagicMock()
        proc = None if existing else mock.Mock(poll=mock.Mock(return_value=None))
        with (
            mock.patch(
                "server.urllib.request.urlopen",
                side_effect=[
                    urllib.error.URLError("connection refused"),
                    urllib.error.HTTPError(url, 503, "unavailable", {}, None),
                    response,
                ],
            ) as open_url,
            mock.patch("server.asyncio.sleep", new_callable=mock.AsyncMock) as sleep,
        ):
            assert asyncio.run(_wait_for_ready(url, 120, proc)) is None
        assert open_url.call_args_list == [mock.call(url, None, 2)] * 3
        assert sleep.await_count == 2
        response.__exit__.assert_called_once()

    def test_timeout_after_unsuccessful_probe(self):
        url = "http://127.0.0.1:8080/api/releases"

        async def wait():
            with (
                mock.patch("server.asyncio.get_running_loop") as get_loop,
                mock.patch(
                    "server.asyncio.to_thread",
                    new_callable=mock.AsyncMock,
                    side_effect=urllib.error.URLError("connection refused"),
                ),
                mock.patch("server.asyncio.sleep", new_callable=mock.AsyncMock),
            ):
                get_loop.return_value.time.side_effect = [0, 0, 120]
                return await _wait_for_ready(url, 120)

        result = asyncio.run(wait())
        assert "HTTP endpoint not responding after 120s" in result
        assert url in result

    def test_process_exit_does_not_report_ready(self):
        proc = mock.Mock(poll=mock.Mock(return_value=1))
        with mock.patch("server.urllib.request.urlopen") as open_url:
            result = asyncio.run(_wait_for_ready("http://127.0.0.1:8080/api/releases", 120, proc))
        assert "process exited (exit 1)" in result
        open_url.assert_not_called()


@pytest.fixture
def serve_mocks(monkeypatch, tmp_path):
    views = tmp_path / "views.yaml"
    views.touch()
    log_path = tmp_path / "serve.log"
    log_path.write_text("backend initializing\n", encoding="utf-8")
    patches = {
        "_data_mode": mock.Mock(return_value="seed"),
        "_dsn_for_mode": mock.Mock(return_value="postgresql://localhost/test"),
        "_default_redis_url": mock.Mock(return_value="redis://localhost:6379"),
        "_repo_path": mock.Mock(side_effect=[views, log_path]),
        "_pids_sippy_serve": mock.Mock(return_value=[123]),
        "_wait_for_ready": mock.AsyncMock(return_value=None),
        "_spawn_background": mock.AsyncMock(return_value=456),
        "_stop_pids": mock.AsyncMock(),
        "_resolve_bigquery_creds": mock.Mock(return_value=(None, None)),
    }
    for name, value in patches.items():
        monkeypatch.setattr(server, name, value)
    return patches


class TestSippyServeReadiness:
    def test_existing_process_waits_for_api_without_spawning_duplicate(self, serve_mocks):
        result = asyncio.run(server.sippy_serve(listen="localhost:9000"))
        serve_mocks["_wait_for_ready"].assert_awaited_once_with(
            "http://localhost:9000/api/releases", 120,
        )
        serve_mocks["_spawn_background"].assert_not_awaited()
        assert "already running and ready" in result

    def test_existing_process_timeout_is_actionable(self, serve_mocks):
        serve_mocks["_wait_for_ready"].return_value = (
            "HTTP endpoint not responding after 120s (checked http://127.0.0.1:8080/api/releases)"
        )
        result = asyncio.run(server.sippy_serve())
        assert "API not responding" in result
        assert "pid(s) 123" in result
        assert "/api/releases" in result
        assert "serve.log" in result
        assert "backend initializing" in result
        assert "and ready" not in result
        serve_mocks["_spawn_background"].assert_not_awaited()
        serve_mocks["_stop_pids"].assert_not_awaited()

    @pytest.mark.parametrize("restart", [False, True])
    def test_new_or_restarted_process_probes_api(self, serve_mocks, restart):
        if not restart:
            serve_mocks["_pids_sippy_serve"].return_value = []
        result = asyncio.run(server.sippy_serve(restart=restart))
        assert "started and ready (pid 456)" in result
        assert serve_mocks["_spawn_background"].call_args.kwargs["ready_url"] == (
            "http://127.0.0.1:8080/api/releases"
        )
        if restart:
            serve_mocks["_stop_pids"].assert_awaited_once_with([123])
        else:
            serve_mocks["_stop_pids"].assert_not_awaited()

    def test_new_process_readiness_failure_is_returned(self, serve_mocks):
        serve_mocks["_pids_sippy_serve"].return_value = []
        serve_mocks["_spawn_background"].return_value = "HTTP endpoint not responding after 120s"
        result = asyncio.run(server.sippy_serve())
        assert result == "HTTP endpoint not responding after 120s"


def test_spawn_background_returns_readiness_failure_with_process_and_logs(tmp_path):
    log_path = tmp_path / "serve.log"
    log_path.write_text("backend initializing\n", encoding="utf-8")
    proc = mock.Mock(pid=456, poll=mock.Mock(return_value=None))
    url = "http://127.0.0.1:8080/api/releases"
    with (
        mock.patch("server._ensure_dev_log_dir"),
        mock.patch("server.subprocess.Popen", return_value=proc),
        mock.patch("server.asyncio.sleep", new_callable=mock.AsyncMock),
        mock.patch(
            "server._wait_for_ready", new_callable=mock.AsyncMock,
            return_value=f"HTTP endpoint not responding after 120s (checked {url})",
        ) as wait,
    ):
        result = asyncio.run(server._spawn_background(
            "sippy_serve", ["unused"], tmp_path, log_path, ready_url=url,
        ))
    wait.assert_awaited_once_with(url, 120, proc)
    assert "sippy_serve started (pid 456) but HTTP endpoint not responding" in result
    assert url in result
    assert str(log_path) in result
    assert "backend initializing" in result
    proc.kill.assert_not_called()
