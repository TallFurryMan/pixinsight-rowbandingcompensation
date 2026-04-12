#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="RowBandingCompensation"
PACKAGE_SOURCE_PATH="src/scripts/${PACKAGE_ID}"
MIN_PIXINSIGHT_VERSION="1.9.3"
MAX_PIXINSIGHT_VERSION="1.9.9999"
PROJECT_URL="https://github.com/TallFurryMan/pixinsight-rowbandingcompensation"

usage() {
  cat <<EOF
Usage: $0 <tag> [output-directory]

Build a PixInsight update repository directory for a tagged release.

Arguments:
  tag               Git tag to package, for example 1.0.0.
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

normalize_semver() {
  local value="$1"
  local core build prerelease major minor patch extra

  value="${value#v}"
  value="${value#V}"

  if [[ ! "${value}" =~ ^[0-9]+(\.[0-9]+){0,2}(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; then
    return 1
  fi

  core="${value}"
  build=""
  prerelease=""

  if [[ "${core}" == *"+"* ]]; then
    build="+${core#*+}"
    core="${core%%+*}"
  fi

  if [[ "${core}" == *"-"* ]]; then
    prerelease="-${core#*-}"
    core="${core%%-*}"
  fi

  IFS="." read -r major minor patch extra <<< "${core}"
  if [ -n "${extra:-}" ]; then
    return 1
  fi

  minor="${minor:-0}"
  patch="${patch:-0}"

  printf "%s.%s.%s%s%s\n" "${major}" "${minor}" "${patch}" "${prerelease}" "${build}"
}

VERSION="${TAG#v}"
VERSION="${VERSION#V}"
NORMALIZED_VERSION="$(normalize_semver "${TAG}" || true)"

if [ -z "${NORMALIZED_VERSION}" ]; then
  echo "error: tag '${TAG}' must be semantic version-like: <major>, <major>.<minor>, or <major>.<minor>.<patch>, with optional leading v" >&2
  exit 1
fi

SCRIPT_VERSION="$(
  git show "${TAG}:${PACKAGE_SOURCE_PATH}/${PACKAGE_ID}.js" \
    | sed -n 's/^#define VERSION "\([^"]*\)"/\1/p' \
    | head -n 1
)"

if [ -z "${SCRIPT_VERSION}" ]; then
  echo "error: cannot read script VERSION from ${TAG}:${PACKAGE_SOURCE_PATH}/${PACKAGE_ID}.js" >&2
  exit 1
fi

NORMALIZED_SCRIPT_VERSION="$(normalize_semver "${SCRIPT_VERSION}" || true)"
if [ -z "${NORMALIZED_SCRIPT_VERSION}" ]; then
  echo "error: script VERSION '${SCRIPT_VERSION}' is not semantic version-like" >&2
  exit 1
fi

if [ "${NORMALIZED_SCRIPT_VERSION}" != "${NORMALIZED_VERSION}" ]; then
  echo "error: tag version ${VERSION} normalizes to ${NORMALIZED_VERSION}, but script VERSION ${SCRIPT_VERSION} normalizes to ${NORMALIZED_SCRIPT_VERSION}" >&2
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

cat > "${OUTPUT_PATH}/index.html" <<EOF
<!doctype html>
<html lang="en">
<head>
   <meta charset="utf-8">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <meta http-equiv="refresh" content="0; url=${PROJECT_URL}">
   <link rel="canonical" href="${PROJECT_URL}">
   <title>${PACKAGE_ID} PixInsight Repository</title>
   <style>
      body {
         font-family: ui-sans-serif, system-ui, sans-serif;
         line-height: 1.5;
         margin: 3rem auto;
         max-width: 42rem;
         padding: 0 1.5rem;
      }
      code {
         background: #f3f4f6;
         border-radius: 0.25rem;
         padding: 0.1rem 0.25rem;
      }
   </style>
</head>
<body>
   <h1>${PACKAGE_ID}</h1>
   <p>
      This is the PixInsight update repository endpoint for ${PACKAGE_ID}.
      Browser visitors are redirected to the project README.
   </p>
   <p>
      If redirection does not happen automatically, open
      <a href="${PROJECT_URL}">${PROJECT_URL}</a>.
   </p>
   <p>
      PixInsight should use this repository URL and retrieve <code>updates.xri</code>
      directly from the same location.
   </p>
</body>
</html>
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
