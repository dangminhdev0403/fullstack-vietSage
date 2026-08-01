"""
security_push_store.py - SQLite storage engine and state machine for Phase 0 Security PUSH.

Uses Python stdlib (sqlite3, threading) only.
Persists enrollment queue, device ACK state, command IDs, and spooled events across process restarts.
"""

import hashlib
import sqlite3
import threading
from typing import Any, Dict, List, Optional, Tuple, Union

from security_push_protocol import (
    build_biophoto_command,
    build_user_command,
    parse_ack,
    parse_rtlog_or_transaction,
    sanitize_name,
    validate_jpeg,
    validate_pin,
)


class SecurityPushStore:
    """
    SQLite-backed state engine for Security PUSH protocol emulator.

    Enforces:
      - 1 outstanding command per device.
      - User command -> User ACK 0 -> Type=9 Biophoto -> Face ACK 0 -> Complete profile.
      - Nonzero user ACK blocks face.
      - Sequential profile enrollments reset to user stage.
      - Deterministic event dedupe on event spool.
      - Persistent state across process restart.
    """

    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pin TEXT NOT NULL,
                    name TEXT NOT NULL,
                    photo BLOB NOT NULL
                );

                CREATE TABLE IF NOT EXISTS device_state (
                    sn TEXT PRIMARY KEY,
                    queue_index INTEGER NOT NULL DEFAULT 0,
                    stage TEXT NOT NULL DEFAULT 'user',
                    outstanding_id INTEGER DEFAULT NULL,
                    outstanding_stage TEXT DEFAULT NULL,
                    outstanding_pin TEXT DEFAULT NULL,
                    error TEXT DEFAULT NULL,
                    completed_count INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS event_spool (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dedupe_key TEXT UNIQUE NOT NULL,
                    sn TEXT NOT NULL,
                    pin TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    verifytype TEXT NOT NULL,
                    event_code TEXT NOT NULL,
                    source_table TEXT NOT NULL DEFAULT '',
                    device_index TEXT NOT NULL DEFAULT '',
                    in_out_status TEXT NOT NULL DEFAULT '',
                    raw_line TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS cmd_counter (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    last_cmd_id INTEGER NOT NULL DEFAULT 0
                );

                INSERT OR IGNORE INTO cmd_counter (id, last_cmd_id) VALUES (1, 0);
                """
            )

    def _get_next_cmd_id(self) -> int:
        cur = self._conn.cursor()
        cur.execute("UPDATE cmd_counter SET last_cmd_id = last_cmd_id + 1 WHERE id = 1")
        cur.execute("SELECT last_cmd_id FROM cmd_counter WHERE id = 1")
        row = cur.fetchone()
        return row["last_cmd_id"]

    def enqueue(self, pin: Any, name: Any, photo: bytes) -> int:
        """
        Enqueue a new profile into the enrollment queue.
        Validates PIN, name, and photo prior to insertion.
        """
        valid_pin = validate_pin(pin)
        clean_name = sanitize_name(name)
        validate_jpeg(photo)

        with self._lock, self._conn:
            cur = self._conn.cursor()
            cur.execute(
                "INSERT INTO queue (pin, name, photo) VALUES (?, ?, ?)",
                (valid_pin, clean_name, photo),
            )
            return cur.lastrowid

    def _get_or_create_device_state(self, sn: str) -> dict:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM device_state WHERE sn = ?", (sn,))
        row = cur.fetchone()
        if row:
            return dict(row)

        cur.execute(
            "INSERT INTO device_state (sn, queue_index, stage) VALUES (?, 0, 'user')",
            (sn,),
        )
        return {
            "sn": sn,
            "queue_index": 0,
            "stage": "user",
            "outstanding_id": None,
            "outstanding_stage": None,
            "outstanding_pin": None,
            "error": None,
            "completed_count": 0,
        }

    def next_command(self, sn: str) -> Optional[str]:
        """
        Get next command to send to device sn.

        Enforces 1 outstanding command per device.
        Returns command string or None.
        """
        with self._lock, self._conn:
            state = self._get_or_create_device_state(sn)

            # Blocked if error exists or command already outstanding
            if state["error"] or state["outstanding_id"] is not None:
                return None

            cur = self._conn.cursor()
            cur.execute(
                "SELECT id, pin, name, photo FROM queue ORDER BY id ASC LIMIT 1 OFFSET ?",
                (state["queue_index"],),
            )
            profile = cur.fetchone()
            if not profile:
                return None

            cmd_id = self._get_next_cmd_id()
            stage = state["stage"]

            if stage == "user":
                cmd_str = build_user_command(cmd_id, profile["pin"], profile["name"])
            else: # stage == "face"
                cmd_str = build_biophoto_command(cmd_id, profile["pin"], bytes(profile["photo"]))

            # Update state with outstanding command
            cur.execute(
                """
                UPDATE device_state
                SET outstanding_id = ?, outstanding_stage = ?, outstanding_pin = ?
                WHERE sn = ?
                """,
                (cmd_id, stage, profile["pin"], sn),
            )

            return cmd_str

    def ack(self, sn: str, ack_body_or_dict: Union[str, dict]) -> None:
        """
        Process command ACK for device sn.

        Matches command ID to outstanding command.
        Nonzero user ACK blocks face command.
        Face Return=0 completes enrollment and advances queue.
        """
        if isinstance(ack_body_or_dict, str):
            parsed = parse_ack(ack_body_or_dict)
        elif isinstance(ack_body_or_dict, dict):
            parsed = ack_body_or_dict
        else:
            parsed = None

        if not parsed or "cmd_id" not in parsed or "return_code" not in parsed:
            return

        cmd_id = parsed["cmd_id"]
        return_code = parsed["return_code"]

        with self._lock, self._conn:
            state = self._get_or_create_device_state(sn)
            outstanding_id = state["outstanding_id"]

            if outstanding_id is None or cmd_id != outstanding_id:
                return  # Stale or unmatched ACK

            outstanding_stage = state["outstanding_stage"]
            cur = self._conn.cursor()

            # Clear outstanding command state
            if return_code != 0:
                # Command failed
                error_msg = f"{outstanding_stage} return={return_code}"
                cur.execute(
                    """
                    UPDATE device_state
                    SET outstanding_id = NULL, outstanding_stage = NULL, outstanding_pin = NULL, error = ?
                    WHERE sn = ?
                    """,
                    (error_msg, sn),
                )
            else:
                # Command succeeded (return_code == 0)
                if outstanding_stage == "user":
                    cur.execute(
                        """
                        UPDATE device_state
                        SET outstanding_id = NULL, outstanding_stage = NULL, outstanding_pin = NULL, stage = 'face'
                        WHERE sn = ?
                        """,
                        (sn,),
                    )
                else: # outstanding_stage == "face"
                    # Profile enrollment completed
                    cur.execute(
                        """
                        UPDATE device_state
                        SET outstanding_id = NULL, outstanding_stage = NULL, outstanding_pin = NULL,
                            stage = 'user', queue_index = queue_index + 1, completed_count = completed_count + 1
                        WHERE sn = ?
                        """,
                        (sn,),
                    )

    def add_event(self, sn: str, event_line_or_dict: Union[str, dict]) -> bool:
        """
        Spool an attendance/rtlog event with deterministic deduplication.

        Returns True if inserted, False if duplicate.
        """
        if isinstance(event_line_or_dict, str):
            event = parse_rtlog_or_transaction(event_line_or_dict, sn=sn)
        else:
            event = dict(event_line_or_dict)
            if "sn" not in event:
                event["sn"] = sn

        dedupe_parts = (
            event.get("sn"), event.get("source_table"), event.get("device_index"),
            event.get("timestamp"), event.get("pin"), event.get("event_code"),
            event.get("verifytype"), event.get("in_out_status"),
        )
        dedupe_str = "\x1f".join(str(part or "") for part in dedupe_parts)
        dedupe_key = hashlib.sha256(dedupe_str.encode("utf-8")).hexdigest()

        with self._lock:
            try:
                with self._conn:
                    cur = self._conn.cursor()
                    cur.execute(
                        """
                        INSERT INTO event_spool (
                            dedupe_key, sn, pin, timestamp, verifytype, event_code,
                            source_table, device_index, in_out_status, raw_line
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            dedupe_key,
                            event.get("sn", sn),
                            event.get("pin", ""),
                            event.get("timestamp", ""),
                            str(event.get("verifytype", "")),
                            str(event.get("event_code", "")),
                            str(event.get("source_table", "")),
                            str(event.get("device_index", "")),
                            str(event.get("in_out_status", "")),
                            event.get("raw_line", str(event_line_or_dict)),
                        ),
                    )
                return True
            except sqlite3.IntegrityError:
                return False

    def get_events(self) -> List[Dict[str, Any]]:
        """
        Get all spooled events.
        """
        with self._lock:
            cur = self._conn.cursor()
            cur.execute("""
                SELECT sn, pin, timestamp, verifytype, event_code, source_table,
                       device_index, in_out_status, raw_line
                FROM event_spool ORDER BY id ASC
            """)
            return [dict(r) for r in cur.fetchall()]

    def get_device_state(self, sn: str) -> Dict[str, Any]:
        """
        Get current state of device sn.
        """
        with self._lock:
            return self._get_or_create_device_state(sn)

    def get_outstanding(self, sn: str) -> Optional[Dict[str, Any]]:
        """
        Get outstanding command information for device sn if any.
        """
        with self._lock:
            state = self._get_or_create_device_state(sn)
            if state["outstanding_id"] is None:
                return None
            return {
                "id": state["outstanding_id"],
                "stage": state["outstanding_stage"],
                "pin": state["outstanding_pin"],
            }

    def close(self) -> None:
        """
        Close underlying SQLite connection.
        """
        with self._lock:
            self._conn.close()
