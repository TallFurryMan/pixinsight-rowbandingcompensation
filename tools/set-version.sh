#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="RowBandingCompensation"
PACKAGE_SOURCE_PATH="src/scripts/${PACKAGE_ID}"
MAIN_SCRIPT="${PACKAGE_SOURCE_PATH}/${PACKAGE_ID}.js"
CHANGE_LOG="${PACKAGE_SOURCE_PATH}/change-log.txt"

usage() {
  cat <<EOF
Usage: $0 <version>

Update the PJSR package version before creating a release tag.

Accepted version forms:
  <major>
  <major>.<minor>
  <major>.<minor>.<patch>

An optional leading v is accepted and removed. Short forms are normalized to
three numeric components because the script VERSION directive is the canonical
package version used by PixInsight and by the repository builder.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

RAW_VERSION="${1:-}"
if [ -z "${RAW_VERSION}" ]; then
  usage >&2
  exit 1
fi

normalize_numeric_version() {
  local value="$1"
  local major minor patch extra

  value="${value#v}"
  value="${value#V}"

  if [[ ! "${value}" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]]; then
    return 1
  fi

  IFS="." read -r major minor patch extra <<< "${value}"
  if [ -n "${extra:-}" ]; then
    return 1
  fi

  minor="${minor:-0}"
  patch="${patch:-0}"

  printf "%s.%s.%s\n" "${major}" "${minor}" "${patch}"
}

VERSION="$(normalize_numeric_version "${RAW_VERSION}" || true)"
if [ -z "${VERSION}" ]; then
  echo "error: version '${RAW_VERSION}' must be <major>, <major>.<minor>, or <major>.<minor>.<patch>, with optional leading v" >&2
  exit 1
fi

perl -0pi -e 's/#define VERSION "[^"]+"/#define VERSION "'"${VERSION}"'"/' "${MAIN_SCRIPT}"
perl -0pi -e 's/RowBandingCompensation version [^<]+/RowBandingCompensation version '"${VERSION}"'/' "${MAIN_SCRIPT}"

CURRENT_CHANGELOG_VERSION="$(head -n 1 "${CHANGE_LOG}")"
if [ "${CURRENT_CHANGELOG_VERSION}" != "${VERSION}" ]; then
  TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/rbc-changelog.XXXXXX")"
  {
    printf "%s\n\n" "${VERSION}"
    printf -- "- Release %s\n\n" "${VERSION}"
    cat "${CHANGE_LOG}"
  } > "${TMP_FILE}"
  mv "${TMP_FILE}" "${CHANGE_LOG}"
fi

printf "Updated %s to %s\n" "${PACKAGE_ID}" "${VERSION}"
