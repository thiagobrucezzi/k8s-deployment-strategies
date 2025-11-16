#!/bin/bash

set -e

echo "=== Deploying Canary Rollout ==="

# Apply manifests
echo "Deploying canary rollout and service..."

kubectl apply -f manifests/canary/

# Wait for initial rollout
echo "Waiting for initial rollout to complete..."
kubectl argo rollouts get rollout canary-belo -w