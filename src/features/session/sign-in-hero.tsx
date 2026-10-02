import type { StaticImageData } from "next/image";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import buildingPhoto from "./fattor-building.webp";

export interface SignInHeroProps {
  readonly logo: StaticImageData;
}

export async function SignInHero({ logo }: SignInHeroProps) {
  const t = await getTranslations();

  return (
    <div
      data-slot="sign-in-hero"
      className="relative isolate flex min-h-40 shrink-0 flex-col justify-end overflow-hidden bg-brand-navy-deep text-white lg:min-h-0 lg:w-1/2"
    >
      <Image
        src={buildingPhoto}
        alt=""
        fill
        sizes="(min-width: 1024px) max(50vw, 178vh), 100vw"
        loading="eager"
        fetchPriority="high"
        className="-z-20 object-cover object-[30%_45%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-r from-brand-navy-deep from-25% to-brand-navy-deep/75 lg:bg-linear-to-t lg:from-brand-navy-deep lg:via-brand-navy-deep/90 lg:via-40% lg:to-brand-navy-deep/0 lg:to-65%"
      />
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:gap-5 lg:px-12 lg:py-14">
        <p className="flex items-center gap-2 text-sm font-semibold lg:text-base">
          <Image
            src={logo}
            alt=""
            width={28}
            height={28}
            loading="eager"
            className="size-7 shrink-0 rounded-md bg-white p-0.5"
          />
          <span>{t("appBar.name")}</span>
        </p>
        <span aria-hidden="true" className="h-0.5 w-12 rounded-full bg-brand-gold" />
        <p className="max-w-md text-base leading-snug font-medium text-balance lg:text-3xl lg:leading-tight lg:font-semibold">
          {t("signIn.hero.tagline")}
        </p>
      </div>
    </div>
  );
}
