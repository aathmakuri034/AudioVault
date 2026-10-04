import ExpoModulesCore
import MediaPlayer

/// Adds Next / Previous track buttons to the iOS Lock Screen, Control Center,
/// headphone and CarPlay-style remote controls.
///
/// expo-audio registers play/pause/seek on `MPRemoteCommandCenter` but not
/// track navigation, so this module owns only `nextTrackCommand` and
/// `previousTrackCommand` and forwards presses to JavaScript, where the
/// AudioVault queue decides what plays next. It never touches the commands
/// expo-audio manages, so the two coexist.
public class AudioVaultRemoteCommandsModule: Module {
  private var nextTarget: Any?
  private var previousTarget: Any?

  public func definition() -> ModuleDefinition {
    Name("AudioVaultRemoteCommands")

    Events("onRemoteNext", "onRemotePrevious")

    Function("enable") { (canGoNext: Bool, canGoPrevious: Bool) in
      DispatchQueue.main.async {
        self.registerTargetsIfNeeded()
        let center = MPRemoteCommandCenter.shared()
        center.nextTrackCommand.isEnabled = canGoNext
        center.previousTrackCommand.isEnabled = canGoPrevious
      }
    }

    Function("disable") {
      DispatchQueue.main.async {
        self.removeTargets()
      }
    }

    OnDestroy {
      DispatchQueue.main.async {
        self.removeTargets()
      }
    }
  }

  private func registerTargetsIfNeeded() {
    let center = MPRemoteCommandCenter.shared()
    if nextTarget == nil {
      nextTarget = center.nextTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onRemoteNext")
        return .success
      }
    }
    if previousTarget == nil {
      previousTarget = center.previousTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onRemotePrevious")
        return .success
      }
    }
  }

  private func removeTargets() {
    let center = MPRemoteCommandCenter.shared()
    if let target = nextTarget {
      center.nextTrackCommand.removeTarget(target)
      nextTarget = nil
    }
    if let target = previousTarget {
      center.previousTrackCommand.removeTarget(target)
      previousTarget = nil
    }
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
  }
}
