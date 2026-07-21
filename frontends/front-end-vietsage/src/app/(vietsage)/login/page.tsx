"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Swal from "sweetalert2";
import { z } from "zod";

import { VsIcon } from "../_components/vs-icon";

const heroImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD9Srcwemedi0EAbhP_AmsxklA2qaF3atQBccoD1Y9ZWXV6_Fw2PpA1JHbjWzDtCVUe1AcyA1Zk6IDjTyHaw9jjaR5rZIZJBuk_jz2tgVJ4GyyMkxYuqY8tUJ1enUwoF3n-9ixotbNU-yVtqDenY0jaDDUcgb0o4pPX6j8sfI0cKBol7_2KUUIiV-f59UC9ehwGoleY2H8paJXiPYhvBtzK7TJBqzQx_mALk2WXPX2_8o7EQrVaYGHkus10g0EqwkEKZKGDFvk6Bes";

const fieldClassName =
  "w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 font-body-md text-on-surface placeholder:text-outline outline-none transition-all duration-200 focus:border-primary focus:ring-1 focus:ring-primary";

const heroTypingPhrases = [
  "Trải nghiệm di sản đương đại",
  "Gìn giữ di sản, nâng tầm trải nghiệm",
  "Tinh hoa nghỉ dưỡng đậm bản sắc Việt",
];

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập địa chỉ email.")
    .email("Email không đúng định dạng."),
  password: z
    .string()
    .min(1, "Vui lòng nhập mật khẩu.")
    .min(8, "Mật khẩu cần tối thiểu 8 ký tự."),
  remember: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>;

const initialLoginValues: LoginFormValues = {
  email: "",
  password: "",
  remember: false,
};

function getLoginSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const { search } = window.location;
  const params = new URLSearchParams(search);

  // Recover links copied with a space after "?", for example /login? email=...
  if (search.startsWith("?%20") || search.startsWith("?+")) {
    const decodedSearch = decodeURIComponent(search.slice(1)).trimStart();
    return new URLSearchParams(decodedSearch);
  }

  return params;
}

function getInitialLoginValues(): LoginFormValues {
  const params = getLoginSearchParams();
  const email = params.get("email")?.trim() ?? "";
  const password = params.get("password") ?? "";

  if (!email && !password) {
    return initialLoginValues;
  }

  return {
    ...initialLoginValues,
    email,
    password,
  };
}

function resolveSignInErrorMessage(error: string | undefined): string {
  if (!error) {
    return "Không thể xác thực tài khoản. Vui lòng thử lại.";
  }

  if (error.includes("CredentialsSignin")) {
    return "Thông tin đăng nhập không chính xác";
  }

  if (error.includes("RefreshAccessTokenError")) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (error.includes("AUTH_SERVICE_UNAVAILABLE")) {
    return "Dịch vụ đăng nhập tạm thời gián đoạn. Vui lòng thử lại sau.";
  }

  return "Không thể đăng nhập lúc này. Vui lòng thử lại.";
}

function getValidationErrors(values: LoginFormValues): LoginFormErrors {
  const result = loginSchema.safeParse(values);
  if (result.success) {
    return {};
  }

  const fieldErrors = result.error.flatten().fieldErrors;

  return {
    email: fieldErrors.email?.[0],
    password: fieldErrors.password?.[0],
    remember: fieldErrors.remember?.[0],
  };
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

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [heroPhraseIndex, setHeroPhraseIndex] = useState(0);
  const [typedHeroText, setTypedHeroText] = useState("");
  const [isHeroFading, setIsHeroFading] = useState(false);

  const [formValues, setFormValues] =
    useState<LoginFormValues>(getInitialLoginValues);
  const [formErrors, setFormErrors] = useState<LoginFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoSubmittedRef = useRef(false);

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

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, type, value, checked } = event.target;
    const field = name as keyof LoginFormValues;

    const nextValues: LoginFormValues = {
      ...formValues,
      [field]: type === "checkbox" ? checked : value,
    } as LoginFormValues;

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
    const field = event.target.name as keyof LoginFormValues;
    const nextErrors = getValidationErrors(formValues);

    setFormErrors((prev) => ({
      ...prev,
      [field]: nextErrors[field],
    }));
  };

  const submitLogin = async (values: LoginFormValues) => {
    const nextErrors = getValidationErrors(values);
    setFormErrors(nextErrors);

    const hasError = Object.values(nextErrors).some((value) => Boolean(value));
    if (hasError) {
      await Swal.fire({
        icon: "error",
        title: "Thông tin chưa hợp lệ",
        text: "Vui lòng kiểm tra lại email và mật khẩu.",
        confirmButtonText: "Đã hiểu",
        confirmButtonColor: "#3f6f64",
      });
      return;
    }

    setIsSubmitting(true);
    Swal.fire({
      title: "Đang đăng nhập",
      text: "Vui lòng chờ trong giây lát.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const callbackUrl = getLoginSearchParams().get("callbackUrl");

      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
        callbackUrl: callbackUrl ?? undefined,
      });

      if (!result || result.error) {
        Swal.close();
        setIsSubmitting(false);
        await Swal.fire({
          icon: "error",
          title: "Đăng nhập thất bại",
          text: resolveSignInErrorMessage(result?.error ?? undefined),
          confirmButtonText: "Thử lại",
          confirmButtonColor: "#3f6f64",
        });
        return;
      }

      Swal.update({
        icon: "success",
        title: "Đăng nhập thành công",
        text: "Đang chuyển hướng...",
      });

      // Hard-navigate to the server post-login route which reads the
      // fresh session cookie and resolves the redirect server-side.
      // This eliminates the client-side session polling race condition.
      const postLoginUrl = `/api/auth/post-login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`;
      window.location.assign(postLoginUrl);
    } catch {
      Swal.close();
      setIsSubmitting(false);
      await Swal.fire({
        icon: "error",
        title: "Không thể đăng nhập",
        text: "Không thể kết nối hệ thống đăng nhập. Vui lòng thử lại.",
        confirmButtonText: "Đã hiểu",
        confirmButtonColor: "#3f6f64",
      });
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitLogin(formValues);
  };

  useEffect(() => {
    const params = getLoginSearchParams();
    const email = params.get("email")?.trim() ?? "";
    const password = params.get("password") ?? "";
    const autoLogin = params.get("autoLogin") === "1" || params.get("autologin") === "1";

    if (!autoLogin || hasAutoSubmittedRef.current || !email || !password) {
      return;
    }

    hasAutoSubmittedRef.current = true;
    void submitLogin({ email, password, remember: false });
  }, []);

  const emailInputClass = `${fieldClassName} ${
    formErrors.email
      ? "border-[var(--error)] focus:border-[var(--error)] focus:ring-[color:rgba(186,26,26,0.25)]"
      : ""
  }`;

  const passwordInputClass = `${fieldClassName} ${
    formErrors.password
      ? "border-[var(--error)] focus:border-[var(--error)] focus:ring-[color:rgba(186,26,26,0.25)]"
      : ""
  }`;

  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface font-body-md">
      <main className="flex h-screen shrink-0 flex-col overflow-hidden md:flex-row">
        <section className="relative hidden h-full overflow-hidden md:block md:w-1/2 lg:w-3/5">
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
                Tham gia cùng chúng tôi để tận hưởng những dịch vụ nghỉ dưỡng
                cao cấp, nơi truyền thống hòa quyện cùng sự sang trọng hiện đại.
              </p>
            </div>
          </div>
        </section>

        <section className="relative flex h-full w-full flex-col items-center justify-center bg-surface-container-lowest px-margin-mobile py-20 md:w-1/2 md:px-16 md:py-0 lg:w-2/5 lg:px-24">
          <div className="absolute left-margin-mobile top-8 md:hidden">
            <div className="flex items-center gap-2">
              <Image
                src="/brand/vietsage-icon.png"
                alt="VietSage icon"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
              <span className="font-display-lg-mobile text-display-lg-mobile tracking-tight text-primary">
                VietSage
              </span>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <div className="mb-12 hidden flex-col items-start md:flex">
              <div className="mb-2 flex items-center gap-3">
                <Image
                  src="/brand/vietsage-icon.png"
                  alt="VietSage icon"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <span className="font-display-lg text-display-lg tracking-tight text-primary">
                  VietSage
                </span>
              </div>
              <p className="font-label-md uppercase tracking-wider text-on-surface-variant opacity-70">
                Luxury Hotel & Resort
              </p>
            </div>

            <div className="mb-8">
              <h1 className="mb-2 font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
                Chào mừng trở lại
              </h1>
              <p className="font-body-md text-on-surface-variant">
                Vui lòng đăng nhập vào tài khoản hội viên của bạn.
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleLoginSubmit} noValidate>
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="font-label-md text-label-md text-on-surface-variant"
                >
                  Địa chỉ Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="username@example.com"
                  value={formValues.email}
                  onChange={handleInputChange}
                  onBlur={handleFieldBlur}
                  className={emailInputClass}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={
                    formErrors.email ? "email-error" : undefined
                  }
                />
                {formErrors.email ? (
                  <p
                    id="email-error"
                    className="text-sm font-medium text-[var(--error)]"
                  >
                    {formErrors.email}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="font-label-md text-label-md text-on-surface-variant"
                  >
                    Mật khẩu
                  </label>
                  <Link
                    href="#"
                    className="font-label-md text-secondary transition-all hover:underline"
                  >
                    Quên mật khẩu?
                  </Link>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={formValues.password}
                    onChange={handleInputChange}
                    onBlur={handleFieldBlur}
                    className={passwordInputClass}
                    aria-invalid={Boolean(formErrors.password)}
                    aria-describedby={
                      formErrors.password ? "password-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant transition-colors hover:text-on-surface-variant"
                  >
                    <EyeIcon showPassword={showPassword} />
                  </button>
                </div>
                {formErrors.password ? (
                  <p
                    id="password-error"
                    className="text-sm font-medium text-[var(--error)]"
                  >
                    {formErrors.password}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center space-x-3">
                <input
                  id="remember"
                  name="remember"
                  type="checkbox"
                  checked={formValues.remember}
                  onChange={handleInputChange}
                  onBlur={handleFieldBlur}
                  className="h-5 w-5 rounded border-outline-variant text-primary focus:ring-primary"
                />
                <label
                  htmlFor="remember"
                  className="select-none font-body-md text-on-surface-variant"
                >
                  Ghi nhớ đăng nhập
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 font-label-md text-white shadow-sm transition-all duration-300 hover:bg-tertiary-container hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Đang xử lý..." : "Đăng nhập"}
                <VsIcon name="arrow_forward" className="text-[20px]" />
              </button>
            </form>

            <div className="mt-8 border-t border-outline-variant pt-8 text-center">
              <p className="font-body-md text-on-surface-variant">
                Chưa có tài khoản hội viên?{" "}
                <Link
                  href="/register"
                  className="font-bold text-primary hover:underline"
                >
                  Đăng ký ngay
                </Link>
              </p>
            </div>
          </div>

          <div className="absolute bottom-8 flex w-full flex-col items-center justify-between gap-4 px-margin-mobile text-caption text-outline md:flex-row md:px-16 lg:px-24">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="flex items-center gap-1 transition-colors hover:text-on-surface-variant"
              >
                <span className="text-[16px]">
                  <GlobeIcon />
                </span>
                Tiếng Việt
              </button>
              <button
                type="button"
                className="flex items-center gap-1 transition-colors hover:text-on-surface-variant"
              >
                English
              </button>
            </div>
            <div className="flex gap-4">
              <Link
                href="#"
                className="transition-colors hover:text-on-surface-variant"
              >
                Hỗ trợ
              </Link>
              <Link
                href="#"
                className="transition-colors hover:text-on-surface-variant"
              >
                Bảo mật
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full bg-tertiary-container px-margin-mobile py-8 text-on-tertiary-container md:px-margin-desktop">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 md:flex-row md:gap-6">
          <div className="font-display-lg-mobile text-display-lg-mobile">
            VietSage
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <Link
              href="#"
              className="font-label-md text-label-md text-on-tertiary-container opacity-80 transition-opacity hover:opacity-100"
            >
              Privacy Policy
            </Link>
            <Link
              href="#"
              className="font-label-md text-label-md text-on-tertiary-container opacity-80 transition-opacity hover:opacity-100"
            >
              Terms of Service
            </Link>
            <Link
              href="#"
              className="font-label-md text-label-md text-on-tertiary-container opacity-80 transition-opacity hover:opacity-100"
            >
              Contact Us
            </Link>
          </div>
          <div className="font-body-md text-body-md opacity-60">
            © 2024 VietSage Luxury Hotel & Resort. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
