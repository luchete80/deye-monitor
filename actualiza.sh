
#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Fetching all remotes..."
git fetch --all

echo "Pulling origin/master..."
git pull origin master

echo "Update completed."

