#!/bin/bash

set -e

echo "=== Deploying Blue-Green Rollout ==="

# Apply manifests
echo "Deploying blue-green rollout and service..."

kubectl apply -f manifests/blue-green/

# Wait for initial rollout
echo "Waiting for initial rollout to complete..."
kubectl argo rollouts get rollout blue-green-belo -w