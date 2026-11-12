import AppKit
import Foundation

// Quit only this user's foreground applications; never force-kill processes.
let protectedBundles: Set<String> = [
    "com.google.Chrome", "kz.koshirme.desktop", "com.apple.finder",
    "com.apple.dock", "com.apple.systemuiserver", "com.apple.loginwindow",
    "com.apple.SecurityAgent", "com.apple.VoiceOver", "com.apple.universalaccesscontrol"
]
struct RunningApp: Codable {
    let pid: Int32
    let name: String
    let path: String
    let launched: Double
}
func eligible(_ app: NSRunningApplication) -> Bool {
    app.processIdentifier != getpid() && app.processIdentifier != getppid()
        && !app.isTerminated && app.activationPolicy == .regular
        && !protectedBundles.contains(app.bundleIdentifier ?? "")
        && app.bundleURL != nil
}
func descriptor(_ app: NSRunningApplication) -> RunningApp {
    RunningApp(pid: app.processIdentifier, name: app.localizedName ?? "Application",
               path: app.bundleURL!.path, launched: app.launchDate?.timeIntervalSince1970 ?? 0)
}
let args = Array(CommandLine.arguments.dropFirst())
if args == ["list"] {
    let apps = NSWorkspace.shared.runningApplications.filter(eligible).map(descriptor)
    print(String(data: try JSONEncoder().encode(apps), encoding: .utf8)!)
} else if args.count == 4 && args[0] == "quit",
          let pid = Int32(args[1]), let launched = Double(args[3]) {
    if let app = NSRunningApplication(processIdentifier: pid) {
        guard eligible(app), app.bundleURL?.path == args[2],
              abs((app.launchDate?.timeIntervalSince1970 ?? 0) - launched) < 0.001 else {
            fputs("Application identity changed or is protected\n", stderr); exit(2)
        }
        // A true return means a request was sent. JS verifies actual exit separately.
        print(app.terminate() ? "true" : "false")
    } else { print("true") }
} else { fputs("Usage: app-guard list | quit PID BUNDLE_PATH LAUNCH_TIME\n", stderr); exit(2) }
