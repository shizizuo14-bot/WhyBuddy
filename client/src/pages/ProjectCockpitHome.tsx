import Home, { type HomeProps } from "./Home";

/**
 * `/projects` mount point.
 *
 * The previous top main-chain timeline band was intentionally removed so the
 * project hub starts directly with the Home surface.
 */
export default function ProjectCockpitHome(props: HomeProps = {}) {
  return (
    <div data-region="project-cockpit-layout-band">
      <Home {...props} />
    </div>
  );
}
