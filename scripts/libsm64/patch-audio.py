"""Apply separate user music/SFX gains after native sequence dynamics and fades."""
from pathlib import Path
import sys
source=Path(sys.argv[1])/"src/decomp/audio/effects.c"
text=source.read_text()
old="channelVolume * gTrackVolume"
assert text.count(old)==1
text="extern float rs64_sequence_volume(int player);\n"+text.replace(old,old+" * rs64_sequence_volume((int)(seqChannel->seqPlayer - gSequencePlayers))")
source.with_name(".viewer-effects.c").write_text(text)
