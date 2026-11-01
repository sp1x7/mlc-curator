import background from "@web/assets/background.jpg";

/**
 * The photo behind the windows with a 60 % black layer on top, so window text
 * stays readable where the picture is bright. `object-cover` fills it at any
 * window size, `-z-10` pushes the whole block behind the window layer.
 */
export default function Background() {
  return (
    <div data-slot="background" className="fixed inset-0 -z-10">
      <img src={background} alt="" className="size-full object-cover" />
      {/* The dim layer covers the picture alone; windows sit above it. */}
      <div className="absolute inset-0 bg-black/60" />
    </div>
  );
}
