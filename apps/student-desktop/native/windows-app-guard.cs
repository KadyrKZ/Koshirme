using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

internal static class WindowsAppGuard
{
    private const int AccessDenied = 5;
    private const int InvalidParameter = 87;
    private const int InsufficientBuffer = 122;
    private const int NotFound = 1168;
    private static readonly HashSet<string> ProtectedNames = new HashSet<string>(
        ("chrome explorer dwm winlogon csrss smss services lsass svchost sihost taskhostw " +
         "shellexperiencehost startmenuexperiencehost searchhost searchapp textinputhost runtimebroker " +
         "securityhealthsystray securityhealthservice consent credentialuibroker logonui lockapp " +
         "narrator magnify osk ctfmon").Split(' '), StringComparer.OrdinalIgnoreCase);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    public class Application
    {
        public int pid { get; set; }
        public string name { get; set; }
        public string path { get; set; }
        public long launched { get; set; }
    }

    public class Request
    {
        public string action { get; set; }
        public int ownerPid { get; set; }
        public Application[] pending { get; set; }
        public Application app { get; set; }
    }

    private sealed class CheckFailure : Exception
    {
        internal readonly string Stage, Api;
        internal readonly int Pid;
        internal CheckFailure(string stage, string api, int pid, Exception error)
            : base(error.Message, error)
        {
            Stage = stage;
            Api = api;
            Pid = pid;
        }
    }

    private sealed class Candidate
    {
        internal Application App;
        internal bool CanClose;
    }

    private sealed class Identity
    {
        internal string Path, Sid;
        internal long Launched;
    }

    private delegate bool EnumProc(IntPtr window, IntPtr param);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out int pid);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ProcessIdToSessionId(int pid, out uint session);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length, out int required);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static CheckFailure Win32Failure(string stage, string api, int pid)
    {
        return new CheckFailure(stage, api, pid, new Win32Exception(Marshal.GetLastWin32Error()));
    }

    private static CheckFailure InvalidIdentity(string stage, int pid, string message)
    {
        return new CheckFailure(stage, "ValidateIdentity", pid, new InvalidOperationException(message));
    }

    private static void Report(CheckFailure failure, string severity)
    {
        var error = failure.InnerException;
        var win32 = error as Win32Exception;
        Console.Error.WriteLine(Json.Serialize(new {
            severity = severity, stage = failure.Stage, api = failure.Api,
            pid = failure.Pid, win32Code = win32 == null ? (int?)null : win32.NativeErrorCode,
            hresult = error.HResult, exception = error.GetType().FullName, message = error.Message
        }));
    }

    private static uint SessionId(int pid, string stage)
    {
        uint session;
        if (!ProcessIdToSessionId(pid, out session))
            throw Win32Failure(stage, "ProcessIdToSessionId", pid);
        return session;
    }

    private static Identity ReadIdentity(int pid, string stage)
    {
        // PROCESS_QUERY_LIMITED_INFORMATION works across 32-bit and 64-bit processes.
        IntPtr process = OpenProcess(0x1000, false, pid);
        if (process == IntPtr.Zero) throw Win32Failure(stage, "OpenProcess", pid);

        IntPtr token = IntPtr.Zero, buffer = IntPtr.Zero;
        try
        {
            var path = new StringBuilder(32768);
            int length = path.Capacity;
            if (!QueryFullProcessImageName(process, 0, path, ref length))
                throw Win32Failure(stage, "QueryFullProcessImageNameW", pid);
            long created, exited, kernel, user;
            if (!GetProcessTimes(process, out created, out exited, out kernel, out user))
                throw Win32Failure(stage, "GetProcessTimes", pid);

            if (!OpenProcessToken(process, 8, out token))
                throw Win32Failure(stage, "OpenProcessToken", pid);
            int required;
            if (!GetTokenInformation(token, 1, IntPtr.Zero, 0, out required))
            {
                var failure = Win32Failure(stage, "GetTokenInformation(size)", pid);
                if (((Win32Exception)failure.InnerException).NativeErrorCode != InsufficientBuffer || required <= 0)
                    throw failure;
            }
            buffer = Marshal.AllocHGlobal(required);
            if (!GetTokenInformation(token, 1, buffer, required, out required))
                throw Win32Failure(stage, "GetTokenInformation(TokenUser)", pid);
            string sid;
            try { sid = new SecurityIdentifier(Marshal.ReadIntPtr(buffer)).Value; }
            catch (Exception error) { throw new CheckFailure(stage, "SecurityIdentifier", pid, error); }
            return new Identity {
                Path = path.ToString(), Sid = sid,
                Launched = new DateTimeOffset(DateTime.FromFileTimeUtc(created)).ToUnixTimeMilliseconds()
            };
        }
        finally
        {
            if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
            if (token != IntPtr.Zero) CloseHandle(token);
            CloseHandle(process);
        }
    }

    private static Dictionary<int, List<IntPtr>> ListWindows()
    {
        var windows = new Dictionary<int, List<IntPtr>>();
        CheckFailure callbackError = null;
        bool ok = EnumWindows(delegate(IntPtr window, IntPtr ignored) {
            if (!IsWindowVisible(window)) return true;
            int pid;
            if (GetWindowThreadProcessId(window, out pid) == 0)
            {
                var failure = Win32Failure("list-windows", "GetWindowThreadProcessId", 0);
                if (!IsWindow(window)) return true;
                callbackError = failure;
                return false;
            }
            List<IntPtr> handles;
            if (!windows.TryGetValue(pid, out handles))
                windows.Add(pid, handles = new List<IntPtr>());
            handles.Add(window);
            return true;
        }, IntPtr.Zero);
        var enumerationFailure = ok ? null : Win32Failure("list-windows", "EnumWindows", 0);
        if (callbackError != null) throw callbackError;
        if (enumerationFailure != null) throw enumerationFailure;
        return windows;
    }

    private static bool SameImage(string left, string right)
    {
        return String.Equals(left, right, StringComparison.OrdinalIgnoreCase);
    }

    private static bool Matches(Identity identity, Application app)
    {
        return SameImage(identity.Path, app.path) && identity.Launched == app.launched;
    }

    private static Candidate Inspect(int pid, uint session, Identity owner, Application pending, string stage)
    {
        string name = pending == null ? "PID " + pid : pending.name;
        try
        {
            if (SessionId(pid, stage) != session) return null;
            // Preserve the existing system/Chrome exemptions when the name is available.
            try
            {
                using (var process = Process.GetProcessById(pid)) name = process.ProcessName;
            }
            catch (Exception error)
            {
                Report(new CheckFailure(stage, "Process.ProcessName", pid, error), "warning");
            }
            if (ProtectedNames.Contains(name)) return null;

            var identity = ReadIdentity(pid, stage);
            if (identity.Sid != owner.Sid || SameImage(identity.Path, owner.Path)) return null;
            if (pending != null && !Matches(identity, pending)) return null;
            name = Path.GetFileNameWithoutExtension(identity.Path);
            if (ProtectedNames.Contains(name)) return null;
            return new Candidate {
                App = new Application { pid = pid, name = name, path = identity.Path, launched = identity.Launched },
                CanClose = !String.Equals(name, "ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)
            };
        }
        catch (CheckFailure failure)
        {
            var win32 = failure.InnerException as Win32Exception;
            if (win32 != null && (win32.NativeErrorCode == InvalidParameter || win32.NativeErrorCode == NotFound) &&
                (failure.Api == "OpenProcess" || failure.Api == "ProcessIdToSessionId"))
            {
                Report(failure, "info");
                return null; // The PID from the window snapshot may have exited.
            }
            if (win32 == null || win32.NativeErrorCode != AccessDenied) throw;

            // Keep unresolved visible or previously requested apps as blockers.
            Report(failure, "warning");
            return new Candidate {
                App = new Application { pid = pid, name = name, path = "", launched = 0 },
                CanClose = false
            };
        }
    }

    private static void CloseWindows(Candidate candidate, List<IntPtr> windows, uint session, Identity owner)
    {
        var app = candidate.App;
        foreach (var window in windows)
        {
            if (!IsWindow(window)) continue;
            int pid;
            if (GetWindowThreadProcessId(window, out pid) == 0)
            {
                var failure = Win32Failure("close-window", "GetWindowThreadProcessId", app.pid);
                if (!IsWindow(window)) continue;
                throw failure;
            }
            if (pid != app.pid) throw InvalidIdentity("close-window", app.pid, "Window identity changed");
            var live = Inspect(app.pid, session, owner, app, "recheck-close-target");
            if (live == null) break;
            if (!live.CanClose)
                throw InvalidIdentity("recheck-close-target", app.pid, "Application identity is unavailable");
            if (!PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero))
                throw Win32Failure("close-window", "PostMessageW(WM_CLOSE)", app.pid);
        }
    }

    private static void Run(Request request)
    {
        if (request == null || request.ownerPid <= 0 ||
            (request.action != "list" && (request.action != "quit" || request.app == null || request.app.pid <= 0)))
            throw InvalidIdentity("request", 0, "Invalid application check request");

        int self;
        using (var process = Process.GetCurrentProcess()) self = process.Id;
        uint session = SessionId(self, "helper-session");
        if (SessionId(request.ownerPid, "guard-session") != session)
            throw InvalidIdentity("guard-session", request.ownerPid, "Guard belongs to another Windows session");
        var owner = ReadIdentity(request.ownerPid, "guard-identity");
        using (var user = WindowsIdentity.GetCurrent())
        {
            if (user.User.Value != owner.Sid)
                throw InvalidIdentity("guard-identity", request.ownerPid, "Guard belongs to another Windows user");
        }

        var windows = ListWindows();
        var apps = new Dictionary<int, Candidate>();
        foreach (var pid in windows.Keys)
        {
            if (pid == self || pid == request.ownerPid) continue;
            var candidate = Inspect(pid, session, owner, null, "window-process");
            if (candidate != null) apps.Add(pid, candidate);
        }
        foreach (var pending in request.pending ?? new Application[0])
        {
            if (pending.pid <= 0 || pending.pid == self || pending.pid == request.ownerPid ||
                windows.ContainsKey(pending.pid)) continue;
            var candidate = Inspect(pending.pid, session, owner, pending, "pending-process");
            if (candidate != null) apps.Add(pending.pid, candidate);
        }
        if (request.action == "list")
        {
            var result = new List<Application>();
            foreach (var candidate in apps.Values) result.Add(candidate.App);
            Console.WriteLine(Json.Serialize(result));
            return;
        }

        Candidate target;
        if (apps.TryGetValue(request.app.pid, out target))
        {
            if (!target.CanClose || !SameImage(target.App.path, request.app.path) || target.App.launched != request.app.launched)
                throw InvalidIdentity("validate-close-target", request.app.pid, "Application identity changed or access was denied");
            CloseWindows(target, windows[request.app.pid], session, owner);
        }
        Console.WriteLine("true");
    }

    private static int Main()
    {
        Console.InputEncoding = Console.OutputEncoding = new UTF8Encoding(false);
        Request request = null;
        try
        {
            try { request = Json.Deserialize<Request>(Console.In.ReadToEnd()); }
            catch (Exception error) { throw new CheckFailure("request", "JavaScriptSerializer.Deserialize", 0, error); }
            Run(request);
            return 0;
        }
        catch (CheckFailure failure) { Report(failure, "error"); }
        catch (Exception error) { Report(new CheckFailure("helper", "WindowsAppGuard.Run", request == null ? 0 : request.ownerPid, error), "error"); }
        return 1;
    }
}
