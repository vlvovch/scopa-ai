import Foundation
import Capacitor

/// Reports how this binary was built so the web layer can refuse to send
/// analytics from anything that is not a Release build on a real device
/// (src/analytics/gate.ts). Every value is decided at compile time or by
/// the build system, never by the web bundle:
///   - `debug`: the DEBUG compilation condition (Debug configuration).
///   - `simulator`: compiled for the Simulator, or running under it.
///   - `configuration`: the Xcode configuration name, written into
///     Info.plist as `AppBuildConfiguration = $(CONFIGURATION)`.
/// If this plugin is missing or fails, the web layer treats the build
/// information as unavailable and keeps analytics off.
///
/// `language` is separate from the build facts: the localization iOS chose
/// for this app out of the ones the bundle declares (CFBundleLocalizations:
/// en, it), from the device's ordered language list and the app's own
/// language in iOS Settings. The web view reports only the first device
/// language, so the web layer asks here (src/i18n/systemLanguage.ts).
@objc(BuildInfoPlugin)
public class BuildInfoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BuildInfoPlugin"
    public let jsName = "BuildInfo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "language", returnType: CAPPluginReturnPromise),
    ]

    @objc func language(_ call: CAPPluginCall) {
        call.resolve(["language": Bundle.main.preferredLocalizations.first ?? ""])
    }

    @objc func get(_ call: CAPPluginCall) {
        #if DEBUG
        let debug = true
        #else
        let debug = false
        #endif

        #if targetEnvironment(simulator)
        let simulatorTarget = true
        #else
        let simulatorTarget = false
        #endif
        let environment = ProcessInfo.processInfo.environment
        let simulatorRuntime = environment["SIMULATOR_DEVICE_NAME"] != nil || environment["SIMULATOR_UDID"] != nil

        let configuration = Bundle.main.object(forInfoDictionaryKey: "AppBuildConfiguration") as? String ?? ""

        call.resolve([
            "configuration": configuration,
            "debug": debug,
            "simulator": simulatorTarget || simulatorRuntime,
        ])
    }
}
