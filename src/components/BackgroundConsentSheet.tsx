/**
 * First-run consent sheet for background chimes.
 *
 * Design rationale: iOS shows its OS-level notification prompt exactly
 * once. If we ask before the user knows what "background chimes" means,
 * and they tap Don't Allow, the only recovery is Settings.app. So we
 * present a *soft* pre-prompt (this sheet) that explains what we're about
 * to ask for and why, and only trigger the OS prompt after the user
 * explicitly opts in.
 *
 * This component is a controlled shell. It:
 *   - opens automatically the first time chimes are enabled AND the user
 *     has never seen the sheet (`settings.backgroundConsentAsked === false`),
 *   - stays closed forever afterward unless re-opened from Settings,
 *   - never nags: dismissing counts as "we asked."
 *
 * The actual permission dance lives in the consent controller.
 */
import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBackgroundConsent } from "@/hooks/useBackgroundConsent";
import { useSettings } from "@/lib/settings";
import { currentPlatform } from "@/lib/native/platform";

export function BackgroundConsentSheet() {
  const settings = useSettings();
  const { snapshot, controller } = useBackgroundConsent();
  const platform = currentPlatform();

  // Auto-open once for eligible users: chimes are on, we've never asked,
  // and the state machine agrees we're in a resting pre-ask state.
  useEffect(() => {
    const chimingEnabled = settings.chimeHour || settings.chimeQuarters;
    if (!chimingEnabled) return;
    if (settings.backgroundConsentAsked) return;
    if (snapshot.state !== "not_asked") return;
    controller.openSheet();
  }, [
    controller,
    snapshot.state,
    settings.chimeHour,
    settings.chimeQuarters,
    settings.backgroundConsentAsked,
  ]);

  // Any transition out of "asking" counts as "we asked" for future launches.
  useEffect(() => {
    if (snapshot.state !== "asking" && !settings.backgroundConsentAsked) {
      if (
        snapshot.state === "granted" ||
        snapshot.state === "denied_by_os" ||
        snapshot.state === "declined_by_user" ||
        snapshot.state === "revoked"
      ) {
        settings.update({ backgroundConsentAsked: true });
      }
    }
  }, [snapshot.state, settings]);

  const open = snapshot.state === "asking";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Treat outside-tap / esc as "just foreground" so we don't leave
        // the machine stuck in `asking` forever.
        if (!next && snapshot.state === "asking") controller.declineFromSheet();
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl font-semibold">
            Ring the chimes in the background?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-sm text-muted-foreground">
              <p>
                Time Chime can chime the quarters and toll the hour even when
                the app isn't visible or your screen is off. This uses the
                device's notification scheduler — nothing runs on our servers.
              </p>
              <p>
                To do that, {platform === "ios" ? "iOS" : platform === "android" ? "Android" : "your browser"}{" "}
                needs to grant permission to post scheduled notifications
                {platform === "android"
                  ? ", and — on Android 12 and newer — permission to schedule exact alarms."
                  : "."}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                <li>We never collect analytics, contacts, or location.</li>
                <li>You can revoke this any time in your system settings.</li>
                <li>Declining still leaves foreground chimes working.</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto whitespace-normal text-center"
            onClick={() => controller.declineFromSheet()}
          >
            Just while the app is open
          </Button>
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto whitespace-normal text-center"
            onClick={() => {
              void controller.grantFromSheet();
            }}
          >
            Allow background chimes
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
