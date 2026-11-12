const [major, minor] = process.versions.node.split('.').map(Number);
if (
  process.platform !== 'win32' ||
  process.arch !== 'x64' ||
  major < 22 ||
  (major === 22 && minor < 12)
) {
  console.error('Use Windows with Node.js x64 >= 22.12 (24 LTS recommended).');
  process.exit(1);
}
console.log(`Build environment: Node ${process.versions.node}, Windows ${process.arch}`);
