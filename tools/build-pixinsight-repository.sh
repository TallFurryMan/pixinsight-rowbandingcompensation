#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="RowBandingCompensation"
PACKAGE_SOURCE_PATH="src/scripts/${PACKAGE_ID}"
MIN_PIXINSIGHT_VERSION="1.9.3"
MAX_PIXINSIGHT_VERSION="1.9.9999"

usage() {
  cat <<EOF
Usage: $0 <tag> [output-directory]

Build a PixInsight update repository directory for a tagged release.

Arguments:
  tag               Git tag to package, for example v1.0.0.
  output-directory  Destination repository directory. Defaults to ./repository.

The output directory will contain:
  updates.xri
  packages/${PACKAGE_ID}-<version>.tar.gz
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

TAG="${1:-}"
OUTPUT_DIR="${2:-repository}"

if [ -z "${TAG}" ]; then
  TAG="$(git describe --tags --exact-match 2>/dev/null || true)"
fi

if [ -z "${TAG}" ]; then
  echo "error: no tag specified and HEAD is not tagged" >&2
  usage >&2
  exit 1
fi

if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "error: tag '${TAG}' does not exist" >&2
  exit 1
fi

VERSION="${TAG#v}"
case "${VERSION}" in
  [0-9]*.[0-9]*.[0-9]*)
    ;;
  *)
    echo "error: tag '${TAG}' must look like v<major>.<minor>.<patch>" >&2
    exit 1
    ;;
esac

SCRIPT_VERSION="$(
  git show "${TAG}:${PACKAGE_SOURCE_PATH}/${PACKAGE_ID}.js" \
    | sed -n 's/^#define VERSION "\([^"]*\)"/\1/p' \
    | head -n 1
)"

if [ -z "${SCRIPT_VERSION}" ]; then
  echo "error: cannot read script VERSION from ${TAG}:${PACKAGE_SOURCE_PATH}/${PACKAGE_ID}.js" >&2
  exit 1
fi

if [ "${SCRIPT_VERSION}" != "${VERSION}" ]; then
  echo "error: tag version ${VERSION} does not match script VERSION ${SCRIPT_VERSION}" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
OUTPUT_PATH="${REPO_ROOT}/${OUTPUT_DIR}"
PACKAGE_NAME="${PACKAGE_ID}-${VERSION}.tar.gz"
PACKAGE_RELATIVE_PATH="packages/${PACKAGE_NAME}"
PACKAGE_PATH="${OUTPUT_PATH}/${PACKAGE_RELATIVE_PATH}"
TAG_EPOCH="$(git log -1 --format=%ct "${TAG}")"

format_epoch_utc() {
  local epoch="$1"
  if date -u -d "@${epoch}" +%Y%m%d%H%M%S >/dev/null 2>&1; then
    date -u -d "@${epoch}" +%Y%m%d%H%M%S
  else
    date -u -r "${epoch}" +%Y%m%d%H%M%S
  fi
}

RELEASE_DATE="$(format_epoch_utc "${TAG_EPOCH}")"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rbc-pixinsight-package.XXXXXX")"

cleanup() {
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

rm -rf "${OUTPUT_PATH}"
mkdir -p "${OUTPUT_PATH}/packages" "${STAGING_DIR}"
touch "${OUTPUT_PATH}/.nojekyll"

git archive --format=tar "${TAG}" "${PACKAGE_SOURCE_PATH}" | tar -xf - -C "${STAGING_DIR}"

if tar --version 2>/dev/null | grep -q "GNU tar"; then
  tar --sort=name \
      --mtime="@${TAG_EPOCH}" \
      --owner=0 \
      --group=0 \
      --numeric-owner \
      -cf - \
      -C "${STAGING_DIR}" src | gzip -n > "${PACKAGE_PATH}"
else
  echo "warning: non-GNU tar detected; package ordering may not be deterministic" >&2
  tar -cf - -C "${STAGING_DIR}" src | gzip -n > "${PACKAGE_PATH}"
fi

PACKAGE_SHA1="$(shasum -a 1 "${PACKAGE_PATH}" | awk '{print $1}')"

cat > "${OUTPUT_PATH}/updates.xri" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<xri version="1.0">
   <description>
      <p>
         RowBandingCompensation PixInsight update repository.
      </p>
      <p>
         This repository provides a platform-independent PJSR script package for conservative horizontal row-banding compensation on linear monochrome images.
      </p>
   </description>
   <platform os="all" arch="noarch" version="${MIN_PIXINSIGHT_VERSION}:${MAX_PIXINSIGHT_VERSION}">
      <package fileName="${PACKAGE_RELATIVE_PATH}"
               sha1="${PACKAGE_SHA1}"
               type="script"
               releaseDate="${RELEASE_DATE}">
         <title>
            ${PACKAGE_ID} ${VERSION}
         </title>
         <remove>
            ${PACKAGE_SOURCE_PATH}
         </remove>
         <description>
            <p>
               Installs ${PACKAGE_ID} ${VERSION}, a PixInsight JavaScript Runtime script for conservative horizontal row-banding compensation.
            </p>
            <p>
               The package deploys the script source files under ${PACKAGE_SOURCE_PATH}. It is intended for monochrome linear frames whose residual banding remains visually horizontal.
            </p>
         </description>
      </package>
   </platform>
</xri>
EOF

cat <<EOF
Built PixInsight repository:
  tag:      ${TAG}
  version:  ${VERSION}
  output:   ${OUTPUT_PATH}
  package:  ${PACKAGE_RELATIVE_PATH}
  sha1:     ${PACKAGE_SHA1}
  date:     ${RELEASE_DATE}
EOF
