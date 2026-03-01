#!/usr/bin/env bash
# Fake Claude script that hangs (for timeout testing)
echo '{"type":"init","session_id":"hanging-session"}'
sleep 3600
