#!/usr/bin/env bash
set -euo pipefail

# 这个脚本用于把发布包解压到同级的 `forvera` 目录，并在解压后启动生产环境。
# 1. 进入 `forvera` 的外层目录。
# 2. 解压 `forvera.zip`，如果提示覆盖则选择 `A`。
# 3. 进入 `forvera/scripts`。
# 4. source 执行 `start-prod.sh`。

unzip -o forvera.zip
cd forvera/scripts
. start-prod.sh
