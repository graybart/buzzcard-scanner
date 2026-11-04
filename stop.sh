#!/usr/bin/env bash
# Stops the check-in app (macOS and Linux). Your data is kept.
D=docker; docker info >/dev/null 2>&1 || D="sudo docker"
$D stop scanner >/dev/null 2>&1 && echo "Check-in app stopped." || echo "Check-in app wasn't running."
