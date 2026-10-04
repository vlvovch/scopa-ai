import UIKit
import Capacitor

/// The app's bridge view controller (created by SceneDelegate; Main.storyboard
/// names it too). Registers the project-local plugins that are not
/// distributed as packages.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureStoragePlugin())
        bridge?.registerPluginInstance(BuildInfoPlugin())
        bridge?.registerPluginInstance(AppleIntelligencePlugin())
        bridge?.registerPluginInstance(KeepAwakePlugin())
        bridge?.registerPluginInstance(ReviewPlugin())
    }
}
