"use client";

import Image from "next/image";
import Link from "next/link";
import { type ChangeEvent, type FocusEvent, type FormEvent, type ReactNode, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { z } from "zod";

import { VsIcon } from "../_components/vs-icon";

const heroImage = "/brand/register-hero.png";

const heroTypingPhrases = [
  "Trải nghiệm di sản đương đại",
  "Gìn giữ di sản, nâng tầm trải nghiệm",
  "Tinh hoa nghỉ dưỡng đậm bản sắc Việt",
];

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Vui lòng nhập họ và tên đầy đủ."),
    email: z.string().trim().min(1, "Vui lòng nhập địa chỉ email.").email("Email không đúng định dạng."),
    phone: z
      .string()
      .trim()
      .min(9, "Số điện thoại cần tối thiểu 9 ký tự.")
      .regex(/^[0-9+\-\s()]+$/, "Số điện thoại chỉ bao gồm số và ký tự hợp lệ."),
    password: z.string().min(8, "Mật khẩu cần tối thiểu 8 ký tự."),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu."),
    terms: z.boolean().refine((value) => value, {
      message: "Bạn cần đồng ý Điều khoản dịch vụ và Chính sách bảo mật.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;
type RegisterFormErrors = Partial<Record<keyof RegisterFormValues, string>>;

const initialFormValues: RegisterFormValues = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  terms: false,
};

function getValidationErrors(values: RegisterFormValues): RegisterFormErrors {
  const result = registerSchema.safeParse(values);
  if (result.success) {
    return {};
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  return {
    fullName: fieldErrors.fullName?.[0],
    email: fieldErrors.email?.[0],
    phone: fieldErrors.phone?.[0],
    password: fieldErrors.password?.[0],
    confirmPassword: fieldErrors.confirmPassword?.[0],
    terms: fieldErrors.terms?.[0],
  };
}

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-outline">{children}</span>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.09 5.18 2 2 0 0 1 5.08 3h3a2 2 0 0 1 2 1.72c.13.8.32 1.58.57 2.3a2 2 0 0 1-.45 2.11L9.1 10.2a16 16 0 0 0 4.7 4.7l1.07-1.1a2 2 0 0 1 2.11-.45c.72.25 1.5.44 2.3.57a2 2 0 0 1 1.72 2Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function LockResetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 2v4" />
      <path d="M20.2 7.8A9 9 0 1 0 21 12" />
      <path d="m20 4 .2 3.8L16.5 8" />
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M9 11V9a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-middle"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

function EyeIcon({ showPassword }: { showPassword: boolean }) {
  return showPassword ? (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-middle"
      aria-hidden="true"
    >
      <path d="M2.5 12S6 5.5 12 5.5s9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-middle"
      aria-hidden="true"
    >
      <path d="M3 3 21 21" />
      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
      <path d="M9.9 5.6A10.8 10.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.7 17.7 0 0 1-3.2 4.1" />
      <path d="M6.4 7.2A17.1 17.1 0 0 0 2.5 12S6 18.5 12 18.5a10.5 10.5 0 0 0 4-.8" />
    </svg>
  );
}

function inputClass(hasError: boolean, withTrailingIcon = false) {
  return `w-full py-4 pl-12 ${withTrailingIcon ? "pr-12" : "pr-4"} rounded-xl border bg-surface-container-low font-body-md text-body-md text-on-surface placeholder:text-outline outline-none transition-all duration-200 ${
    hasError
      ? "border-[var(--error)] focus:border-[var(--error)] focus:shadow-[0_0_0_1px_var(--error)]"
      : "border-outline-variant focus:border-primary focus:shadow-[0_0_0_1px_var(--primary)]"
  }`;
}

export default function RegisterPage() {
  const [formValues, setFormValues] = useState<RegisterFormValues>(initialFormValues);
  const [formErrors, setFormErrors] = useState<RegisterFormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [heroPhraseIndex, setHeroPhraseIndex] = useState(0);
  const [typedHeroText, setTypedHeroText] = useState("");
  const [isHeroFading, setIsHeroFading] = useState(false);

  useEffect(() => {
    const fullPhrase = heroTypingPhrases[heroPhraseIndex];
    let typingTimer: number | undefined;
    let transitionTimer: number | undefined;

    if (typedHeroText.length < fullPhrase.length) {
      typingTimer = window.setTimeout(() => {
        setTypedHeroText(fullPhrase.slice(0, typedHeroText.length + 1));
      }, 96);

      return () => {
        if (typingTimer !== undefined) {
          window.clearTimeout(typingTimer);
        }
      };
    }

    const pauseMs = 4000 + Math.floor(Math.random() * 2001);

    typingTimer = window.setTimeout(() => {
      setIsHeroFading(true);

      transitionTimer = window.setTimeout(() => {
        setHeroPhraseIndex((index) => (index + 1) % heroTypingPhrases.length);
        setTypedHeroText("");
        setIsHeroFading(false);
      }, 420);
    }, pauseMs);

    return () => {
      if (typingTimer !== undefined) {
        window.clearTimeout(typingTimer);
      }
      if (transitionTimer !== undefined) {
        window.clearTimeout(transitionTimer);
      }
    };
  }, [heroPhraseIndex, typedHeroText]);

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, type, value, checked } = event.target;
    const field = name as keyof RegisterFormValues;

    const nextValues = {
      ...formValues,
      [field]: type === "checkbox" ? checked : value,
    } as RegisterFormValues;

    setFormValues(nextValues);

    if (formErrors[field]) {
      const nextErrors = getValidationErrors(nextValues);
      setFormErrors((prev) => ({
        ...prev,
        [field]: nextErrors[field],
      }));
    }
  };

  const handleFieldBlur = (event: FocusEvent<HTMLInputElement>) => {
    const field = event.target.name as keyof RegisterFormValues;
    const nextErrors = getValidationErrors(formValues);

    setFormErrors((prev) => ({
      ...prev,
      [field]: nextErrors[field],
    }));
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = getValidationErrors(formValues);
    setFormErrors(nextErrors);

    const hasErrors = Object.values(nextErrors).some((value) => Boolean(value));
    if (hasErrors) {
      await Swal.fire({
        icon: "error",
        title: "Thông tin chưa hợp lệ",
        text: "Vui lòng kiểm tra lại thông tin đăng ký.",
        confirmButtonText: "Đã hiểu",
        confirmButtonColor: "#3f6f64",
      });
      return;
    }

    setIsSubmitting(true);
    Swal.fire({
      title: "Đang tạo tài khoản",
      text: "Vui lòng chờ trong giây lát.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      await Swal.fire({
        icon: "success",
        title: "Thông tin hợp lệ",
        text: "Biểu mẫu đã sẵn sàng để gửi tới hệ thống tạo tài khoản.",
        confirmButtonText: "Đã hiểu",
        confirmButtonColor: "#3f6f64",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-background">
      <main className="flex min-h-screen">
        <section className="relative hidden overflow-hidden lg:block lg:min-h-screen lg:w-3/5">
          <Image
            src={heroImage}
            alt="Luxury Vietnamese Resort View"
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 50vw"
            unoptimized
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(26,28,28,0.48),rgba(26,28,28,0.12),transparent)]" />

          <div className="absolute inset-0 flex items-center px-10 md:px-12 lg:px-14">
            <div className="max-w-[34rem] text-left text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.45)]">
              <h2
                className={`mb-4 min-h-[7.5rem] font-display-lg text-display-lg font-semibold leading-[1.18] text-[color:rgba(255,255,255,0.98)] transition-opacity duration-500 lg:min-h-[8.5rem] ${
                  isHeroFading ? "opacity-0" : "opacity-100"
                }`}
              >
                {typedHeroText}
                <span className="ml-1 inline-block h-[0.9em] w-[3px] translate-y-[2px] animate-pulse bg-[color:rgba(254,214,91,0.95)] align-middle" />
              </h2>
              <p className="font-body-lg text-body-lg opacity-90">
                Tham gia cùng chúng tôi để tận hưởng những dịch vụ nghỉ dưỡng cao cấp, nơi truyền thống hòa quyện cùng sự
                sang trọng hiện đại.
              </p>
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col justify-center bg-surface px-margin-mobile py-12 lg:w-2/5 md:px-margin-desktop">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-12 text-center lg:hidden">
              <h1 className="font-display-lg-mobile text-display-lg-mobile tracking-tight text-primary">VietSage</h1>
              <p className="mt-2 font-label-md text-label-md uppercase tracking-widest text-secondary">Luxury Hotel & Resort</p>
            </div>

            <div className="mb-10">
              <h2 className="mb-2 font-headline-lg-mobile text-headline-lg-mobile text-primary md:font-headline-lg md:text-headline-lg">
                Đăng ký tài khoản
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Bắt đầu hành trình khám phá di sản cùng VietSage.</p>
            </div>

            <form className="space-y-6" onSubmit={handleRegisterSubmit} noValidate>
              <div className="space-y-2">
                <label htmlFor="fullName" className="font-label-md text-label-md text-on-surface-variant">
                  Họ và tên
                </label>
                <div className="group relative">
                  <FieldIcon>
                    <UserIcon />
                  </FieldIcon>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="Nguyễn Văn A"
                    value={formValues.fullName}
                    onChange={handleFieldChange}
                    onBlur={handleFieldBlur}
                    className={inputClass(Boolean(formErrors.fullName))}
                    aria-invalid={Boolean(formErrors.fullName)}
                    aria-describedby={formErrors.fullName ? "fullName-error" : undefined}
                  />
                </div>
                {formErrors.fullName ? (
                  <p id="fullName-error" className="text-sm font-medium text-[var(--error)]">
                    {formErrors.fullName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="font-label-md text-label-md text-on-surface-variant">
                  Email
                </label>
                <div className="group relative">
                  <FieldIcon>
                    <MailIcon />
                  </FieldIcon>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="example@vietsage.vn"
                    value={formValues.email}
                    onChange={handleFieldChange}
                    onBlur={handleFieldBlur}
                    className={inputClass(Boolean(formErrors.email))}
                    aria-invalid={Boolean(formErrors.email)}
                    aria-describedby={formErrors.email ? "email-error" : undefined}
                  />
                </div>
                {formErrors.email ? (
                  <p id="email-error" className="text-sm font-medium text-[var(--error)]">
                    {formErrors.email}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="phone" className="font-label-md text-label-md text-on-surface-variant">
                  Số điện thoại
                </label>
                <div className="group relative">
                  <FieldIcon>
                    <PhoneIcon />
                  </FieldIcon>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="090 123 4567"
                    value={formValues.phone}
                    onChange={handleFieldChange}
                    onBlur={handleFieldBlur}
                    className={inputClass(Boolean(formErrors.phone))}
                    aria-invalid={Boolean(formErrors.phone)}
                    aria-describedby={formErrors.phone ? "phone-error" : undefined}
                  />
                </div>
                {formErrors.phone ? (
                  <p id="phone-error" className="text-sm font-medium text-[var(--error)]">
                    {formErrors.phone}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="font-label-md text-label-md text-on-surface-variant">
                  Mật khẩu
                </label>
                <div className="group relative">
                  <FieldIcon>
                    <LockIcon />
                  </FieldIcon>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={formValues.password}
                    onChange={handleFieldChange}
                    onBlur={handleFieldBlur}
                    className={inputClass(Boolean(formErrors.password), true)}
                    aria-invalid={Boolean(formErrors.password)}
                    aria-describedby={formErrors.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-primary"
                  >
                    <EyeIcon showPassword={showPassword} />
                  </button>
                </div>
                {formErrors.password ? (
                  <p id="password-error" className="text-sm font-medium text-[var(--error)]">
                    {formErrors.password}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="font-label-md text-label-md text-on-surface-variant">
                  Xác nhận mật khẩu
                </label>
                <div className="group relative">
                  <FieldIcon>
                    <LockResetIcon />
                  </FieldIcon>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={formValues.confirmPassword}
                    onChange={handleFieldChange}
                    onBlur={handleFieldBlur}
                    className={inputClass(Boolean(formErrors.confirmPassword), true)}
                    aria-invalid={Boolean(formErrors.confirmPassword)}
                    aria-describedby={formErrors.confirmPassword ? "confirmPassword-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-primary"
                  >
                    <EyeIcon showPassword={showConfirmPassword} />
                  </button>
                </div>
                {formErrors.confirmPassword ? (
                  <p id="confirmPassword-error" className="text-sm font-medium text-[var(--error)]">
                    {formErrors.confirmPassword}
                  </p>
                ) : null}
              </div>

              <div className="flex items-start space-x-3 py-2">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  checked={formValues.terms}
                  onChange={handleFieldChange}
                  onBlur={handleFieldBlur}
                  className="mt-1 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                  aria-invalid={Boolean(formErrors.terms)}
                  aria-describedby={formErrors.terms ? "terms-error" : undefined}
                />
                <label htmlFor="terms" className="font-body-md text-body-md text-on-surface-variant">
                  Tôi đồng ý với{" "}
                  <Link href="#" className="font-semibold text-primary hover:underline">
                    Điều khoản dịch vụ
                  </Link>{" "}
                  và{" "}
                  <Link href="#" className="font-semibold text-primary hover:underline">
                    Chính sách bảo mật
                  </Link>{" "}
                  của VietSage.
                </label>
              </div>
              {formErrors.terms ? (
                <p id="terms-error" className="-mt-3 text-sm font-medium text-[var(--error)]">
                  {formErrors.terms}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-primary py-4 font-label-md text-label-md uppercase tracking-widest text-on-primary shadow-lg shadow-primary/10 transition-all active:scale-[0.98] hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Đang xử lý..." : "Tạo tài khoản"}
              </button>
            </form>

            <div className="mt-10 text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">
                Bạn đã có tài khoản?
                <Link href="/login" className="ml-2 inline-flex items-center font-bold text-primary hover:underline">
                  Đăng nhập
                  <VsIcon name="arrow_forward" className="ml-1 text-[18px]" />
                </Link>
              </p>
            </div>

            <div className="mt-16 flex items-center justify-center space-x-6">
              <button type="button" className="flex items-center font-label-md text-label-md text-primary">
                <span className="mr-2 text-[18px]">
                  <GlobeIcon />
                </span>
                Tiếng Việt
              </button>
              <button
                type="button"
                className="flex items-center font-label-md text-label-md text-outline transition-colors hover:text-primary"
              >
                English
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
