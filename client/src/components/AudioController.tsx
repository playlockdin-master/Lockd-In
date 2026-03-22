import { useAudioSystem } from "@/hooks/use-audio";
import { Volume2, VolumeX, Music, Music2 } from "lucide-react";
import { Button } from "./Button";

export function AudioController() {
  const { isSfxMuted, isBgmMuted, toggleSfx, toggleBgm, playSound } = useAudioSystem();

  const handleSfxToggle = () => {
    if (!isSfxMuted) playSound('click'); // play click before muting
    toggleSfx();
  };

  const handleBgmToggle = () => {
    playSound('click');
    toggleBgm();
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* BGM toggle — music note icon */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBgmToggle}
        className="bg-black/20 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/20 w-9 h-9"
        title={isBgmMuted ? "Unmute music" : "Mute music"}
      >
        {isBgmMuted
          ? <Music2 className="w-4 h-4 opacity-40" />
          : <Music  className="w-4 h-4" />
        }
      </Button>

      {/* SFX toggle — speaker icon */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSfxToggle}
        className="bg-black/20 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/20 w-9 h-9"
        title={isSfxMuted ? "Unmute sounds" : "Mute sounds"}
      >
        {isSfxMuted ? <VolumeX className="w-5 h-5 opacity-40" /> : <Volume2 className="w-5 h-5" />}
      </Button>
    </div>
  );
}
