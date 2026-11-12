# GitHub Actions templates

Workflow source is preserved here as a template. Automatic workflows were not enabled during the initial source upload, because the GitHub credential used for uploading source has no workflow-management permission. Native builds and tests can be run using scripts/prepare-native-check.ps1 and scripts/prepare-native-check.sh, followed by the platform packaging scripts. To enable CI later, review a template and move it into .github/workflows using a credential with the required permission.
