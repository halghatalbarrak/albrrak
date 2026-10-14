-- التوطين (PR-1): عمود لغة المستخدم (قابلٌ للـnull ⟵ العربية افتراضيّاً). لا FK، لا حذف.
ALTER TABLE "User" ADD COLUMN "locale" "Locale";
