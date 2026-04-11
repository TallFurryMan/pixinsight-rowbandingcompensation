# PixInsight Repository Packaging

This project is distributed as a PixInsight JavaScript Runtime script package. A native process module is future work.

## Repository Model

PixInsight update repositories are HTTP or FTP locations that expose an `updates.xri` XML document directly at the repository URL. The official repository reference states that repository URLs must not redirect, update packages must be compressed archives, package checksums are SHA1 values, and PJSR script packages should use `type="script"` with platform-independent `os="all"` and `arch="noarch"` metadata.

For this repository, the GitHub-generated source archive is not used. It adds a repository-name directory above the files and includes project files that are not PixInsight deployment files. The release workflow instead builds a tarball whose archive root matches PixInsight's installation tree:

```text
src/
  scripts/
    RowBandingCompensation/
      RowBandingCompensation.js
      RowBandingCompensationEngine.js
      ...
```

The generated repository contains:

```text
updates.xri
packages/
  RowBandingCompensation-<version>.tar.gz
```

The package is declared for PixInsight `1.9.3:1.9.9999`, because the script has been validated against PixInsight 1.9.3 and has not yet been tested on older cores.

## GitHub Pages Release

The workflow in `.github/workflows/pixinsight-repository.yml` runs when a numeric release tag is pushed. Tags can use `1`, `1.0`, or `1.0.0` style versioning, with an optional leading `v`. The repository builder normalizes these forms for comparison with the script `VERSION` directive.

Before using it, configure the GitHub repository's Pages source to `GitHub Actions`.

Release sequence:

```sh
git tag 1.0
git push github main
git push github 1.0
```

After the workflow completes, the PixInsight repository URL is expected to be:

```text
https://tallfurryman.github.io/pixinsight-rowbandingcompensation/
```

Use the trailing slash when registering the repository in PixInsight to avoid an avoidable HTTP redirect.

For a manual local build of the same repository structure:

```sh
tools/build-pixinsight-repository.sh 1.0 repository
```

The builder verifies that the tag version matches the `VERSION` directive in `RowBandingCompensation.js`, creates the package tarball, computes its SHA1 checksum, and writes `updates.xri`.

## Signing

PixInsight 1.8.9 introduced script and update repository signing. The official signing reference states that script signatures are stored as `.xsgn` files next to the signed script, while update repository signatures are embedded in the `.xri` document.

For a public signed release:

1. Generate a secure signing keys file with PixInsight's standard `SigningKeys` script.
2. Become a Certified PixInsight Developer with the standard `SubmitCPD` script.
3. Sign `src/scripts/RowBandingCompensation/RowBandingCompensation.js` with the standard `CodeSign` script. Do not sign the included `.js` files separately; the signing process resolves `#include` directives from the main identified script.
4. Commit the generated `RowBandingCompensation.xsgn` signature file before tagging the release, so it is included in the package tarball.
5. Build the repository from the tag.
6. Sign the generated `repository/updates.xri` file with `CodeSign`.
7. Publish the signed `updates.xri` and package tarball.

No special security entitlements are currently expected for `RowBandingCompensation`.

The GitHub Pages workflow intentionally does not perform PixInsight code signing. Signing requires a private `.xssk` keys file and PixInsight's signing implementation, so it should be done locally or on a trusted private runner.

For sandbox testing before CPD approval, PixInsight's security preferences may allow unsigned update repositories and unsigned scripts, but this should not be treated as a production distribution state.

## Certified PixInsight Developer Procedure

The official documented path to become a Certified PixInsight Developer is:

1. Run PixInsight's standard `SigningKeys` script to generate a secure `.xssk` signing keys file with a strong password.
2. Run the standard `SubmitCPD` script.
3. Submit the developer identifier and public signing key. The script can read the public key from the `.xssk` file or accept manual identifier/key data.
4. Provide a working contact email. Public email, URL, name, and additional information are optional in the form, but URL and name are documented as highly recommended.
5. Wait for Pleiades Astrophoto to review the submission. If approved, the CPD data and public key are included in the certified developers database distributed with PixInsight.
6. Once that database update reaches users, signatures generated with the approved CPD identity are recognized by PixInsight.

If the signing keys are lost or changed, submit new CPD data with the same developer identifier and regenerate signatures after the new public key is distributed.

References:

- PixInsight Update Repositories: https://pixinsight.com/doc/docs/PIRepositoryReference/PIRepositoryReference.html
- PixInsight Script Code Signing System: https://pixinsight.com/doc/docs/ScriptCodeSigning/ScriptCodeSigning.html
