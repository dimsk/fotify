ssh dima@omv <<'EOF'
set -euo pipefail

cd fotify

echo "Fetching and pulling latest changes"
git fetch
git pull

# Capture currently used image IDs before bringing the stack down.
# This stays valid even if images get untagged (<none>:<none>).
old_image_ids=$(docker images --format '{{.Repository}} {{.ID}}' | grep  '^fotify' | cut -d' ' -f 2 | xargs echo || true)

echo "Stopping and removing old containers"
docker-compose down --remove-orphans

# Belt-and-suspenders: if a stale fotify-backend/fotify-frontend container
# somehow survived the step above (e.g. left over from a manual `docker run`
# or an interrupted previous deploy), force-remove it so `up` doesn't fail
# with "port already in use by another container".
docker rm -f fotify-backend fotify-frontend 2>/dev/null || true

# Remove any previously built fotify images before rebuilding
echo "Removing old images: $old_image_ids"
if [ -n "$old_image_ids" ]; then
  docker rmi -f $old_image_ids || true
fi

echo "Building and running new images"
docker-compose up --build -d
echo "Backend started"
EOF
