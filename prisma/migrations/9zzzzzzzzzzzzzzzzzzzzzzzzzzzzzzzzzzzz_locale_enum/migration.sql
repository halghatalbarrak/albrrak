-- التوطين (PR-1): نوع اللغة enum مستقلٌّ يسبق الإعداد (ADD/USE يُفصَل كنمط الترحيلات).
CREATE TYPE "Locale" AS ENUM ('ar', 'en', 'ru');
