"""Test for SlideRule AgentLoop 110 SSE stream v2.

agentloop sse stream v2 110 streams incremental normalized events
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.agent_loop_events import (
    iter_agent_loop_v2_sse_frames,
    iter_agent_loop_live_v2_sse_frames,
    format_sse_frame,
)
from services.agent_loop_state_reducer import reduce_run_events


def test_agentloop_sse_stream_v2_110_streams_incremental_normalized_events():
    """agentloop sse stream v2 110 streams incremental normalized events

    Verifies:
    - replays incremental normalized v2 events as stable 'event' frames
    - emits final 'snapshot' frame
    - uses compact JSON
    - finite generator only (no sleeps, no infinite)
    """
    sample_events = [
        {
            "version": "agentloop.event.v2",
            "seq": 0,
            "ts": "2026-01-01T00:00:00Z",
            "runId": "test-run-110",
            "type": "RUN_STARTED",
            "source": "test",
            "phase": "start",
            "payload": {"status": "RUNNING"},
        },
        {
            "version": "agentloop.event.v2",
            "seq": 1,
            "ts": "2026-01-01T00:00:01Z",
            "runId": "test-run-110",
            "type": "AGENT_LOG",
            "source": "agent",
            "phase": "think",
            "payload": {"msg": "step"},
        },
        {
            "version": "agentloop.event.v2",
            "seq": 2,
            "ts": "2026-01-01T00:00:02Z",
            "runId": "test-run-110",
            "type": "RUN_FINALIZED",
            "source": "test",
            "phase": "done",
            "payload": {"status": "DONE"},
        },
    ]

    frames = list(iter_agent_loop_v2_sse_frames(sample_events))

    # replays all 3 events + 1 snapshot
    assert len(frames) == 4

    # stable event name for incremental events
    assert frames[0].startswith("event: event\n")
    assert '"type":"RUN_STARTED"' in frames[0]
    assert '"runId":"test-run-110"' in frames[0]

    assert frames[1].startswith("event: event\n")
    assert '"type":"AGENT_LOG"' in frames[1]

    assert frames[2].startswith("event: event\n")
    assert '"type":"RUN_FINALIZED"' in frames[2]

    # final snapshot frame
    assert frames[3].startswith("event: snapshot\n")
    assert '"finalized":true' in frames[3]
    assert '"status":"DONE"' in frames[3]

    # compact JSON (no pretty spaces)
    assert ',"' in frames[0]  # separators use ,
    assert '":"' in frames[0]

    # verify the reducer snapshot matches what stream emits for last
    computed = reduce_run_events(sample_events)
    snap_frame = format_sse_frame("snapshot", computed)
    assert frames[3] == snap_frame

    # ensure finite: no generator left open, just list it
    assert isinstance(frames, list)


def test_agentloop_live_sse_stream_v2_tails_new_events_until_terminal():
    """Live v2 stream tails new events instead of only replaying the first snapshot."""
    run_id = "live-run-110"
    events_by_poll = [
        [
            {
                "version": "agentloop.event.v2",
                "seq": 0,
                "ts": "2026-01-01T00:00:00Z",
                "runId": run_id,
                "type": "RUN_STARTED",
                "source": "python",
                "phase": "queue",
                "payload": {"status": "running"},
            }
        ],
        [
            {
                "version": "agentloop.event.v2",
                "seq": 0,
                "ts": "2026-01-01T00:00:00Z",
                "runId": run_id,
                "type": "RUN_STARTED",
                "source": "python",
                "phase": "queue",
                "payload": {"status": "running"},
            },
            {
                "version": "agentloop.event.v2",
                "seq": 1,
                "ts": "2026-01-01T00:00:01Z",
                "runId": run_id,
                "type": "HEARTBEAT",
                "source": "python",
                "phase": "queue",
                "payload": {"pid": 24680},
            },
        ],
        [
            {
                "version": "agentloop.event.v2",
                "seq": 0,
                "ts": "2026-01-01T00:00:00Z",
                "runId": run_id,
                "type": "RUN_STARTED",
                "source": "python",
                "phase": "queue",
                "payload": {"status": "running"},
            },
            {
                "version": "agentloop.event.v2",
                "seq": 1,
                "ts": "2026-01-01T00:00:01Z",
                "runId": run_id,
                "type": "HEARTBEAT",
                "source": "python",
                "phase": "queue",
                "payload": {"pid": 24680},
            },
            {
                "version": "agentloop.event.v2",
                "seq": 2,
                "ts": "2026-01-01T00:00:02Z",
                "runId": run_id,
                "type": "RUN_FINALIZED",
                "source": "python",
                "phase": "finalize",
                "payload": {"status": "done"},
            },
        ],
    ]

    def reader(_run_id, limit=None):
        assert _run_id == run_id
        return events_by_poll.pop(0)

    frames = list(
        iter_agent_loop_live_v2_sse_frames(
            run_id,
            read_events_fn=reader,
            poll_interval_seconds=0,
            max_idle_polls=5,
        )
    )

    assert [frame.splitlines()[0] for frame in frames] == [
        "event: event",
        "event: event",
        "event: event",
        "event: snapshot",
    ]
    assert '"type":"RUN_STARTED"' in frames[0]
    assert '"type":"HEARTBEAT"' in frames[1]
    assert '"type":"RUN_FINALIZED"' in frames[2]
    assert '"finalized":true' in frames[3]


def test_agentloop_live_sse_stream_v2_stays_silent_when_no_new_events():
    """Live v2 stream should push only real events, not heartbeat/ping noise."""
    run_id = "quiet-live-run-110"
    calls = 0

    def reader(_run_id, limit=None):
        nonlocal calls
        calls += 1
        assert _run_id == run_id
        return []

    frames = list(
        iter_agent_loop_live_v2_sse_frames(
            run_id,
            read_events_fn=reader,
            poll_interval_seconds=0,
            max_idle_polls=3,
        )
    )

    assert calls == 3
    assert frames == []
