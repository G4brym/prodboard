#!/usr/bin/env bash
# Fake Claude script for integration testing
# Outputs stream-json formatted lines

echo '{"type":"init","session_id":"test-session-123"}'
echo '{"type":"tool_use","tool":"Read","tool_input":{"path":"test.ts"}}'
echo '{"type":"result","result":{"tokens_in":500,"tokens_out":250,"cost_usd":0.005}}'
exit 0
