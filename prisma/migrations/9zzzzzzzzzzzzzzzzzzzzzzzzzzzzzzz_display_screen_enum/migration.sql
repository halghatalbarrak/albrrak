-- الشاشة التحفيزيّة (ش١): تعدادات نوع الشاشة والشريحة والأصل. enum مستقلٌّ يسبق setup.
CREATE TYPE "DisplayScreenKind" AS ENUM ('MOSQUE', 'HOME');
CREATE TYPE "DisplaySlideKind" AS ENUM ('PROGRAM', 'IMAGE');
CREATE TYPE "DisplayAssetType" AS ENUM ('IMAGE', 'VIDEO');
