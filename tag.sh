#!/bin/bash

# 检查是否传入版本号
if [ $# -ne 1 ]; then
    echo "用法: $0 <版本号>"
    echo "示例: $0 1.0.1"
    exit 1
fi

VERSION="v$1"

echo "===== 开始处理版本: $VERSION ====="

# 1. 删除远程 tag
echo "1. 删除远程 tag: $VERSION"
git push origin --delete "$VERSION"

# 2. 删除本地 tag（防止冲突）
echo "2. 删除本地 tag: $VERSION"
git tag -d "$VERSION"

# 3. 本地新建 tag（对应当前 master 最新提交）
echo "3. 新建本地 tag: $VERSION"
git tag -a "$VERSION" -m "Release $VERSION"

# 4. 推送到远程
echo "4. 推送 tag 到远程"
git push origin "$VERSION"

echo -e "\n✅ 完成！tag $VERSION 已重新创建并推送远程"