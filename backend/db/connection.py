import sqlite3

from backend.init_db import DB_PATH


def get_connection() -> sqlite3.Connection:
    """Open a SQLite connection configured for row access by column name."""
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection
