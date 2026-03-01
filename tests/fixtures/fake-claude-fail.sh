#!/usr/bin/env bash
# Fake Claude script that fails
echo '{"type":"init","session_id":"fail-session"}'
echo '{"type":"result","result":{"tokens_in":100,"tokens_out":50,"cost_usd":0.001}}'
exit 1
