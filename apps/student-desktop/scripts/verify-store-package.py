"""Verify the unsigned x64 Store submission artifact independently of electron-builder."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys
import xml.etree.ElementTree as ET
from urllib.parse import unquote
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
PACKAGE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "release" / "store" / f"KOSHIRME-{VERSION}-x64-store.appx"
NAME = "MaratulyKadyr.KOSHIRME"
PUBLISHER = "CN=EA66D633-6C63-45D2-86BE-440D652A6688"
FAMILY = "MaratulyKadyr.KOSHIRME_dhvjgzjbfrr56"
F = "{http://schemas.microsoft.com/appx/manifest/foundation/windows10}"
UAP = "{http://schemas.microsoft.com/appx/manifest/uap/windows10}"
RES = "{http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities}"


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def check_pe(z, path):
    with z.open(path) as handle:
        header = handle.read(64)
        require(header[:2] == b"MZ", f"Missing DOS header: {path}")
        handle.seek(struct.unpack_from("<I", header, 60)[0])
        require(handle.read(6) == b"PE\0\0\x64\x86", f"Expected an x64 executable: {path}")


with ZipFile(PACKAGE) as z:
    require(z.testzip() is None, "Package ZIP contents are corrupt")
    names = z.namelist()
    normalized = [unquote(name).replace("\\", "/") for name in names]
    require(len(set(name.casefold() for name in normalized)) == len(normalized), "Duplicate package entries")
    for path in normalized:
        parts = PurePosixPath(path).parts
        require(not any(part.startswith(".env") or part.lower().endswith((".p12", ".pfx", ".pem", ".key")) for part in parts), f"Unexpected credential file: {path}")
        require(".." not in parts and not path.startswith("/"), f"Unexpected package path: {path}")

    manifest = ET.fromstring(z.read("AppxManifest.xml"))
    require(manifest.find(F + "Identity").attrib == {
        "Name": NAME, "Publisher": PUBLISHER, "Version": VERSION + ".0", "ProcessorArchitecture": "x64",
    }, "Package identity differs from the Store identity")
    publisher_bits = f"{int.from_bytes(hashlib.sha256(PUBLISHER.encode('utf-16-le')).digest()[:8], 'big'):064b}0"
    alphabet = "0123456789abcdefghjkmnpqrstvwxyz"
    publisher_id = "".join(alphabet[int(publisher_bits[i:i+5], 2)] for i in range(0, 65, 5))
    require(f"{NAME}_{publisher_id}" == FAMILY, "Unexpected package family")
    require(manifest.findtext(F + "Properties/" + F + "PublisherDisplayName") == "Maratuly Kadyr", "Wrong publisher display name")
    require(manifest.findtext(F + "Properties/" + F + "DisplayName") == "KOSHIRME", "Package display name must match the reserved Store name")
    require(manifest.find(F + "Dependencies/" + F + "TargetDeviceFamily").get("MinVersion") == "10.0.19041.0", "Wrong minimum Windows version")
    app = manifest.find(F + "Applications/" + F + "Application")
    require(app.attrib == {"Id": "KOSHIRME", "Executable": "app\\KOSH!RME.exe", "EntryPoint": "Windows.FullTrustApplication"}, "Unexpected activation entry point")
    extensions = app.findall(F + "Extensions/" + UAP + "Extension")
    require(len(extensions) == 1 and extensions[0].get("Category") == "windows.protocol" and
            extensions[0].find(UAP + "Protocol").get("Name") == "koshirme", "Expected the koshirme protocol only")
    capabilities = list(manifest.find(F + "Capabilities"))
    require(len(capabilities) == 1 and capabilities[0].tag == RES + "Capability" and
            capabilities[0].get("Name") == "runFullTrust", "Unexpected capabilities")

    lookup = dict(zip(normalized, names))
    check_pe(z, lookup["app/KOSH!RME.exe"])
    check_pe(z, lookup["app/resources/koshirme-app-guard.exe"])
    check_required = {"app/resources/app.asar", "AppxBlockMap.xml", "[Content_Types].xml"}
    require(check_required.issubset(lookup), "Missing app payload or required metadata")
    require(not any(re.search(r"AppxSignature\.p7x$|app-update\.yml$|latest\.yml$", path, re.I) for path in normalized), "Store handoff must be unsigned and omit standalone updater metadata")
    for icon, size in {"StoreLogo.png": 50, "Square44x44Logo.png": 44, "Square150x150Logo.png": 150}.items():
        png = z.read(lookup[f"assets/{icon}"])
        require(png[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack_from(">II", png, 16) == (size, size), f"Bad Store logo: {icon}")
        require(png == (ROOT / "build" / "appx" / icon).read_bytes(), f"Unexpected Store logo: {icon}")

sidecar = PACKAGE.with_suffix(PACKAGE.suffix + ".sha256")
with PACKAGE.open("rb") as handle:
    digest = hashlib.file_digest(handle, "sha256").hexdigest()
sidecar.write_text(f"{digest}  {PACKAGE.name}\n", encoding="ascii")
print(f"Verified {PACKAGE.name}: {NAME} {VERSION}.0 x64, {FAMILY}")
print(f"SHA-256 {digest}")
