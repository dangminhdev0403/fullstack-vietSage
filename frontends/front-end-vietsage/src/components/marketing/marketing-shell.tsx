import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VietSageBrand } from "@/components/brand/vietsage-brand";
import { normalizeLocale, type SupportedLocale } from "@/core/i18n/locales";

import { MarketingHeader } from "./marketing-header";
import { REQUEST_DEMO_URL } from "./marketing-links";
import { MarketingMotionRoot } from "./marketing-motion-root";

const sceneParticles = Array.from({ length: 18 }, (_, index) => ({
  left: `${7 + ((index * 29) % 88)}%`,
  top: `${8 + ((index * 37) % 84)}%`,
  size: `${2 + (index % 4)}px`,
  drift: `${18 + (index % 5) * 5}s`,
  delay: `${-2 - index * 1.35}s`,
  distance: `${28 + (index % 6) * 9}px`,
}));

export const stats = [
  ["24/7", "trợ lý số tại phòng"],
  ["QR", "không cần cài ứng dụng"],
  ["Tức thì", "tự động phân luồng"],
  ["Đa ngữ", "hỗ trợ khách quốc tế"],
];

export type CardItem = { title: string; text: string };
export type MarketingLocale = SupportedLocale;

type ShellCopy = {
  navAria: string;
  railArrival: string;
  railConcierge: string;
  railOperations: string;
  railVisibility: string;
  demoBtn: string;
  guestBtn: string;
  scrollCue: string;
  assistantTitle: string;
  assistantSubtitle: string;
  assistantStatus: string;
  deviceHeading: string;
  deviceSub: string;
  promptPlaceholder: string;
  services: Array<{ icon: string; title: string; text: string; href: string }>;
  experienceTitle: string;
  experienceDesc: string;
  responseLabel: string;
  responseTime: string;
  ctaEyebrow: string;
  ctaTitle: string;
  ctaText: string;
  ctaBtn: string;
  footerTagline: string;
  footerCopyright: string;
  footerCols: Array<{ heading: string; links: Array<{ label: string; href: string }> }>;
};

const SHELL_COPY: Record<SupportedLocale, ShellCopy> = {
  vi: {
    navAria: "Danh mục điều hướng trang chủ",
    railArrival: "Đón tiếp",
    railConcierge: "E-Concierge",
    railOperations: "Vận hành",
    railVisibility: "Minh bạch",
    demoBtn: "Đặt lịch demo",
    guestBtn: "Xem trải nghiệm khách",
    scrollCue: "Khám phá giải pháp",
    assistantTitle: "Trợ lý số VietSage",
    assistantSubtitle: "Chọn nhu cầu của bạn, chúng tôi sẽ hỗ trợ ngay",
    assistantStatus: "Sẵn sàng phục vụ",
    deviceHeading: "Bạn cần gì để kỳ lưu trú thoải mái hơn?",
    deviceSub: "Chọn dịch vụ bạn quan tâm bên dưới",
    promptPlaceholder: "Ví dụ: Đặt bàn ăn, yêu cầu dọn phòng, hỏi thông tin địa phương...",
    services: [
      {
        icon: "/images/concierge/icon-amenities.png",
        title: "Khăn và tiện ích",
        text: "Khăn tắm, đồ dùng cá nhân, ...",
        href: "/g/home?quick=amenities",
      },
      {
        icon: "/images/concierge/icon-dining.png",
        title: "Ẩm thực tại phòng",
        text: "Room service, minibar, ...",
        href: "/g/home?quick=dining",
      },
      {
        icon: "/images/concierge/icon-cleaning.png",
        title: "Dọn phòng",
        text: "Dọn phòng, bổ sung vật dụng, ...",
        href: "/g/home?quick=cleaning",
      },
      {
        icon: "/images/concierge/icon-local.png",
        title: "Hỗ trợ địa phương",
        text: "Đặt xe, tour, thông tin khu vực, ...",
        href: "/g/home?quick=local",
      },
    ],
    experienceTitle: "Trải nghiệm nghỉ dưỡng trọn vẹn",
    experienceDesc: "Mọi nhu cầu của bạn, chúng tôi luôn sẵn sàng.",
    responseLabel: "Phản hồi trong",
    responseTime: "3 phút",
    ctaEyebrow: "Sẵn sàng chuyển đổi số vận hành khách sạn?",
    ctaTitle: "Khởi động lộ trình triển khai cùng VietSage.",
    ctaText:
      "Trao đổi cùng chuyên gia VietSage về tối ưu vận hành, trải nghiệm số cho khách lưu trú, hỗ trợ đa ngôn ngữ và giải pháp tích hợp PMS an toàn, hiệu quả.",
    ctaBtn: "Yêu cầu demo",
    footerTagline: "Nền tảng công nghệ tiên phong cho vận hành khách sạn và thương mại dịch vụ số.",
    footerCopyright: "© 2026 VietSage. Bảo lưu mọi quyền.",
    footerCols: [
      {
        heading: "Công ty",
        links: [
          { label: "Về chúng tôi", href: "/about" },
          { label: "Liên hệ", href: "/contact" },
        ],
      },
      {
        heading: "Giải pháp",
        links: [
          { label: "VietSage Hotel", href: "/" },
          { label: "VietSage Commerce", href: "/commerce" },
        ],
      },
      {
        heading: "Tài nguyên",
        links: [
          { label: "Chính sách bảo mật", href: "#" },
          { label: "Điều khoản sử dụng", href: "#" },
        ],
      },
    ],
  },
  en: {
    navAria: "Homepage navigation",
    railArrival: "Arrival",
    railConcierge: "E-Concierge",
    railOperations: "Operations",
    railVisibility: "Visibility",
    demoBtn: "Book a Demo",
    guestBtn: "Guest Experience",
    scrollCue: "Explore Solutions",
    assistantTitle: "VietSage Digital Assistant",
    assistantSubtitle: "Select your request, we are ready to assist immediately",
    assistantStatus: "Ready to serve",
    deviceHeading: "What would make your stay more comfortable?",
    deviceSub: "Select the service you need below",
    promptPlaceholder: "E.g. Book dining, housekeeping request, local info...",
    services: [
      {
        icon: "/images/concierge/icon-amenities.png",
        title: "Towels & Amenities",
        text: "Bath towels, toiletries, ...",
        href: "/g/home?quick=amenities",
      },
      {
        icon: "/images/concierge/icon-dining.png",
        title: "In-room Dining",
        text: "Room service, minibar, ...",
        href: "/g/home?quick=dining",
      },
      {
        icon: "/images/concierge/icon-cleaning.png",
        title: "Housekeeping",
        text: "Room cleaning, replenishments, ...",
        href: "/g/home?quick=cleaning",
      },
      {
        icon: "/images/concierge/icon-local.png",
        title: "Local Assistance",
        text: "Transport, tours, local guide, ...",
        href: "/g/home?quick=local",
      },
    ],
    experienceTitle: "Complete Stay Experience",
    experienceDesc: "Whatever you need, our team is always ready.",
    responseLabel: "Response in",
    responseTime: "3 mins",
    ctaEyebrow: "Ready to digitize hotel operations?",
    ctaTitle: "Launch your deployment journey with VietSage.",
    ctaText:
      "Consult with VietSage experts on optimizing operations, digital guest experience, multilingual support, and secure PMS integration.",
    ctaBtn: "Request Demo",
    footerTagline: "Pioneering technology platform for hotel operations and digital commerce.",
    footerCopyright: "© 2026 VietSage. All rights reserved.",
    footerCols: [
      {
        heading: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "Contact", href: "/contact" },
        ],
      },
      {
        heading: "Solutions",
        links: [
          { label: "VietSage Hotel", href: "/" },
          { label: "VietSage Commerce", href: "/commerce" },
        ],
      },
      {
        heading: "Resources",
        links: [
          { label: "Privacy Policy", href: "#" },
          { label: "Terms of Use", href: "#" },
        ],
      },
    ],
  },
  zh: {
    navAria: "主页导航",
    railArrival: "迎宾",
    railConcierge: "E-Concierge",
    railOperations: "运营",
    railVisibility: "透明",
    demoBtn: "预约演示",
    guestBtn: "查看住客体验",
    scrollCue: "探索解决方案",
    assistantTitle: "VietSage 数字助理",
    assistantSubtitle: "选择您的需求，我们将即刻为您服务",
    assistantStatus: "在线服务",
    deviceHeading: "需要什么让您的住宿更舒适？",
    deviceSub: "请在下方选择您需要的服务",
    promptPlaceholder: "例如：预订餐饮、客房清洁、咨询周边信息...",
    services: [
      {
        icon: "/images/concierge/icon-amenities.png",
        title: "毛巾与洗漱用品",
        text: "浴巾、个人洗护用品等",
        href: "/g/home?quick=amenities",
      },
      {
        icon: "/images/concierge/icon-dining.png",
        title: "客房送餐",
        text: "送餐服务、迷你吧等",
        href: "/g/home?quick=dining",
      },
      {
        icon: "/images/concierge/icon-cleaning.png",
        title: "客房清洁",
        text: "房间打扫、物品补齐等",
        href: "/g/home?quick=cleaning",
      },
      {
        icon: "/images/concierge/icon-local.png",
        title: "当地礼宾",
        text: "用车预约、游玩路线、周边资讯等",
        href: "/g/home?quick=local",
      },
    ],
    experienceTitle: "惬意无忧的度假体验",
    experienceDesc: "满足您的所需，时刻用心守候。",
    responseLabel: "响应时间",
    responseTime: "3分钟",
    ctaEyebrow: "准备好开启酒店数智化运营了吗？",
    ctaTitle: "与 VietSage 携手开启高效部署之旅。",
    ctaText:
      "与 VietSage 专家深入探讨：优化日常运营、提升住客数字化体验、多语言即时沟通以及安全高效的 PMS 系统对接方案。",
    ctaBtn: "预约演示",
    footerTagline: "引领酒店数智化运营与数字化商业的科技平台。",
    footerCopyright: "© 2026 VietSage. 保留所有权利。",
    footerCols: [
      {
        heading: "关于",
        links: [
          { label: "关于我们", href: "/about" },
          { label: "联系我们", href: "/contact" },
        ],
      },
      {
        heading: "解决方案",
        links: [
          { label: "VietSage Hotel", href: "/" },
          { label: "VietSage Commerce", href: "/commerce" },
        ],
      },
      {
        heading: "资源与条款",
        links: [
          { label: "隐私政策", href: "#" },
          { label: "使用条款", href: "#" },
        ],
      },
    ],
  },
  ko: {
    navAria: "홈페이지 내비게이션",
    railArrival: "환영",
    railConcierge: "E-Concierge",
    railOperations: "운영",
    railVisibility: "투명성",
    demoBtn: "데모 예약",
    guestBtn: "투숙객 경험 둘러보기",
    scrollCue: "솔루션 둘러보기",
    assistantTitle: "VietSage 디지털 비서",
    assistantSubtitle: "필요한 서비스를 선택하시면 즉시 지원합니다",
    assistantStatus: "서비스 준비 완료",
    deviceHeading: "더 편안한 투숙을 위해 무엇이 필요하신가요?",
    deviceSub: "아래에서 관심 있는 서비스를 선택하세요",
    promptPlaceholder: "예: 룸서비스 주문, 객실 청소 요청, 현지 정보 문의...",
    services: [
      {
        icon: "/images/concierge/icon-amenities.png",
        title: "타월 및 어메니티",
        text: "타월, 세면도구 등",
        href: "/g/home?quick=amenities",
      },
      {
        icon: "/images/concierge/icon-dining.png",
        title: "인룸 다이닝",
        text: "룸서비스, 미니바 등",
        href: "/g/home?quick=dining",
      },
      {
        icon: "/images/concierge/icon-cleaning.png",
        title: "객실 정비",
        text: "객실 청소, 비품 추가 등",
        href: "/g/home?quick=cleaning",
      },
      {
        icon: "/images/concierge/icon-local.png",
        title: "현지 가이드 및 지원",
        text: "차량 예약, 투어, 주변 정보 등",
        href: "/g/home?quick=local",
      },
    ],
    experienceTitle: "완벽한 휴양 경험",
    experienceDesc: "고객님의 모든 요청에 즉시 응답합니다.",
    responseLabel: "응답 시간",
    responseTime: "3분",
    ctaEyebrow: "호텔 운영의 디지털 전환을 시작할 준비가 되셨나요?",
    ctaTitle: "VietSage와 함께 스마트 운영 여정을 시작하세요.",
    ctaText:
      "운영 최적화, 투숙객 디지털 경험, 다국어 지원 및 안전한 PMS 연동에 대해 VietSage 전문가와 상담해 보세요.",
    ctaBtn: "데모 신청",
    footerTagline: "호텔 운영 및 디지털 상거래를 선도하는 기술 플랫폼.",
    footerCopyright: "© 2026 VietSage. All rights reserved.",
    footerCols: [
      {
        heading: "회사",
        links: [
          { label: "회사 소개", href: "/about" },
          { label: "문의하기", href: "/contact" },
        ],
      },
      {
        heading: "솔루션",
        links: [
          { label: "VietSage Hotel", href: "/" },
          { label: "VietSage Commerce", href: "/commerce" },
        ],
      },
      {
        heading: "리소스",
        links: [
          { label: "개인정보처리방침", href: "#" },
          { label: "이용약관", href: "#" },
        ],
      },
    ],
  },
  ru: {
    navAria: "Навигация по сайту",
    railArrival: "Прибытие",
    railConcierge: "E-Concierge",
    railOperations: "Операции",
    railVisibility: "Прозрачность",
    demoBtn: "Забронировать демо",
    guestBtn: "Опыт гостя",
    scrollCue: "Узнать о решениях",
    assistantTitle: "Цифровой ассистент VietSage",
    assistantSubtitle: "Выберите услугу, и мы сразу поможем",
    assistantStatus: "Готов к обслуживанию",
    deviceHeading: "Что сделает ваше пребывание комфортнее?",
    deviceSub: "Выберите интересующую услугу ниже",
    promptPlaceholder: "Например: заказ еды, уборка номера, местные советы...",
    services: [
      {
        icon: "/images/concierge/icon-amenities.png",
        title: "Полотенца и принадлежности",
        text: "Полотенца, туалетные принадлежности...",
        href: "/g/home?quick=amenities",
      },
      {
        icon: "/images/concierge/icon-dining.png",
        title: "Обслуживание в номере",
        text: "Заказ блюд, мини-бар...",
        href: "/g/home?quick=dining",
      },
      {
        icon: "/images/concierge/icon-cleaning.png",
        title: "Уборка номера",
        text: "Уборка, пополнение запасов...",
        href: "/g/home?quick=cleaning",
      },
      {
        icon: "/images/concierge/icon-local.png",
        title: "Местная помощь",
        text: "Транспорт, экскурсии, гид...",
        href: "/g/home?quick=local",
      },
    ],
    experienceTitle: "Идеальный отдых",
    experienceDesc: "Мы позаботимся обо всем необходимом.",
    responseLabel: "Отклик за",
    responseTime: "3 мин",
    ctaEyebrow: "Готовы цифровизировать операции вашего отеля?",
    ctaTitle: "Начните внедрение цифровых сервисов вместе с VietSage.",
    ctaText:
      "Обсудите с экспертами VietSage оптимизацию операций, цифровой опыт гостей, многоязычную поддержку и безопасную интеграцию с PMS.",
    ctaBtn: "Запросить демо",
    footerTagline: "Передовая технологическая платформа для гостиничного бизнеса и цифровой коммерции.",
    footerCopyright: "© 2026 VietSage. Все права защищены.",
    footerCols: [
      {
        heading: "Компания",
        links: [
          { label: "О нас", href: "/about" },
          { label: "Контакты", href: "/contact" },
        ],
      },
      {
        heading: "Решения",
        links: [
          { label: "VietSage Hotel", href: "/" },
          { label: "VietSage Commerce", href: "/commerce" },
        ],
      },
      {
        heading: "Ресурсы",
        links: [
          { label: "Политика конфиденциальности", href: "#" },
          { label: "Условия использования", href: "#" },
        ],
      },
    ],
  },
  hi: {
    navAria: "मुखपृष्ठ नेविगेशन",
    railArrival: "आगमन",
    railConcierge: "E-Concierge",
    railOperations: "संचालन",
    railVisibility: "पारदर्शिता",
    demoBtn: "डेमो बुक करें",
    guestBtn: "अतिथि अनुभव देखें",
    scrollCue: "समाधान देखें",
    assistantTitle: "VietSage डिजिटल सहायक",
    assistantSubtitle: "अपनी आवश्यकता चुनें, हम तुरंत सहायता करेंगे",
    assistantStatus: "सेवा के लिए तैयार",
    deviceHeading: "आपके प्रवास को क्या अधिक आरामदायक बना सकता है?",
    deviceSub: "नीचे अपनी पसंदीदा सेवा चुनें",
    promptPlaceholder: "उदा.: भोजन ऑर्डर करें, कमरे की सफाई, स्थानीय जानकारी...",
    services: [
      {
        icon: "/images/concierge/icon-amenities.png",
        title: "तौलिए और सुविधाएं",
        text: "तौलिए, प्रसाधन सामग्री...",
        href: "/g/home?quick=amenities",
      },
      {
        icon: "/images/concierge/icon-dining.png",
        title: "कमरे में भोजन",
        text: "कमरे की सेवा, मिनीबार...",
        href: "/g/home?quick=dining",
      },
      {
        icon: "/images/concierge/icon-cleaning.png",
        title: "कमरे की सफाई",
        text: "सफाई, पुनःपूर्ति...",
        href: "/g/home?quick=cleaning",
      },
      {
        icon: "/images/concierge/icon-local.png",
        title: "स्थानीय सहायता",
        text: "परिवहन, टूर, स्थानीय जानकारी...",
        href: "/g/home?quick=local",
      },
    ],
    experienceTitle: "उत्कृष्ट प्रवास का अनुभव",
    experienceDesc: "आपकी हर जरूरत के लिए हम हमेशा तैयार हैं।",
    responseLabel: "प्रतिक्रिया समय",
    responseTime: "3 मिनट",
    ctaEyebrow: "क्या आप अपने होटल संचालन को डिजिटल बनाने के लिए तैयार हैं?",
    ctaTitle: "VietSage के साथ अपनी कार्यान्वयन यात्रा शुरू करें।",
    ctaText:
      "संचालन अनुकूलन, डिजिटल अतिथि अनुभव, बहुभाषी सहायता और सुरक्षित PMS एकीकरण पर VietSage विशेषज्ञों से परामर्श करें।",
    ctaBtn: "डेमो का अनुरोध करें",
    footerTagline: "होटल संचालन और डिजिटल वाणिज्य के लिए अग्रणी प्रौद्योगिकी मंच।",
    footerCopyright: "© 2026 VietSage. सर्वाधिकार सुरक्षित।",
    footerCols: [
      {
        heading: "कंपनी",
        links: [
          { label: "हमारे बारे में", href: "/about" },
          { label: "संपर्क करें", href: "/contact" },
        ],
      },
      {
        heading: "समाधान",
        links: [
          { label: "VietSage Hotel", href: "/" },
          { label: "VietSage Commerce", href: "/commerce" },
        ],
      },
      {
        heading: "संसाधन",
        links: [
          { label: "गोपनीयता नीति", href: "#" },
          { label: "उपयोग की शर्तें", href: "#" },
        ],
      },
    ],
  },
};

export function MarketingShell({
  children,
  locale = "vi",
  onLocaleChange,
  accountAction = { label: "Đăng nhập", href: "/dangnhap" },
}: {
  children: ReactNode;
  locale?: MarketingLocale;
  onLocaleChange?: (locale: SupportedLocale) => void;
  accountAction?: { label: string; href: string };
}) {
  const activeLocale = normalizeLocale(locale);
  const t = SHELL_COPY[activeLocale] ?? SHELL_COPY.vi;

  return (
    <MarketingMotionRoot className="vs-mkt-shell min-h-screen text-[#132119]">
      <div className="vs-scene-backdrop" aria-hidden="true">
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="arrival" />
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="concierge" />
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="operations" />
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="visibility" />
      </div>
      <div className="vs-scene-particles" aria-hidden="true">
        {sceneParticles.map((particle, index) => (
          <span
            key={index}
            style={
              {
                "--particle-left": particle.left,
                "--particle-top": particle.top,
                "--particle-size": particle.size,
                "--particle-drift": particle.drift,
                "--particle-delay": particle.delay,
                "--particle-distance": particle.distance,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="vs-scroll-progress" aria-hidden="true" />
      <MarketingHeader accountAction={accountAction} locale={activeLocale} onLocaleChange={onLocaleChange} />
      {activeLocale === "vi" ? (
        <nav className="vs-scene-rail" aria-label="Danh mục điều hướng trang chủ">
          <a href="#arrival" data-scene-link="arrival"><span>01</span><em>{t.railArrival}</em></a>
          <a href="#concierge" data-scene-link="concierge"><span>02</span><em>{t.railConcierge}</em></a>
          <a href="#operations" data-scene-link="operations"><span>03</span><em>{t.railOperations}</em></a>
          <a href="#visibility" data-scene-link="visibility"><span>04</span><em>{t.railVisibility}</em></a>
        </nav>
      ) : (
        <nav className="vs-scene-rail" aria-label={t.navAria}>
          <a href="#arrival" data-scene-link="arrival"><span>01</span><em>{t.railArrival}</em></a>
          <a href="#concierge" data-scene-link="concierge"><span>02</span><em>{t.railConcierge}</em></a>
          <a href="#operations" data-scene-link="operations"><span>03</span><em>{t.railOperations}</em></a>
          <a href="#visibility" data-scene-link="visibility"><span>04</span><em>{t.railVisibility}</em></a>
        </nav>
      )}
      {children}
      <Footer locale={activeLocale} />
    </MarketingMotionRoot>
  );
}

export function SectionHeader({ eyebrow, title, text, reveal = "fade" }: { eyebrow: string; title: string; text: string; reveal?: "fade" | "from-left" | "from-right" }) {
  return (
    <div className="vs-section-header mx-auto max-w-3xl text-center" data-reveal={reveal}>
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b8872f]">{eyebrow}</p>
      <h2 className="vs-display mt-3 text-3xl font-bold leading-tight tracking-[-0.025em] text-[#181410] md:text-5xl md:leading-tight [text-wrap:balance]">{title}</h2>
      <p className="mt-4 text-base sm:text-lg leading-7 sm:leading-8 text-[#5c5549]">{text}</p>
    </div>
  );
}

export function Hero({
  eyebrow,
  title,
  text,
  children,
  image,
  locale = "vi",
}: {
  eyebrow: string;
  title: string;
  text: string;
  image?: string;
  children?: ReactNode;
  locale?: MarketingLocale;
}) {
  const activeLocale = normalizeLocale(locale);
  const t = SHELL_COPY[activeLocale] ?? SHELL_COPY.vi;
  const services = t.services;

  return (
    <section id="arrival" data-scene="arrival" className="vs-cinematic-scene vs-hero-scene relative overflow-hidden">
      <div className="vs-scene-watermark" aria-hidden="true">SAGE</div>
      {image && (
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-15 mix-blend-multiply">
          <Image src={image} alt="" fill className="object-cover" priority />
        </div>
      )}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div data-reveal="from-left">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b8872f]">{eyebrow}</p>
            <h1 className="vs-display mt-3 text-2xl sm:text-3xl lg:text-4xl xl:text-[2.65rem] font-bold leading-[1.14] tracking-[-0.025em] text-[#181410] [text-wrap:balance]">
              {title}
            </h1>
            <p className="mt-3 sm:mt-3.5 max-w-xl text-sm sm:text-base leading-relaxed text-[#5c5549]">{text}</p>
            <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row gap-3">
              <a
                className="vs-mkt-primary-btn w-full sm:w-auto rounded-full bg-gradient-to-r from-[#94691f] via-[#b8872f] to-[#cf9e3c] px-6 sm:px-7 py-3 sm:py-3.5 text-center text-sm font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-[#b8872f]/25 transition-all hover:brightness-105 hover:shadow-xl hover:shadow-[#b8872f]/35"
                href={REQUEST_DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.demoBtn}
              </a>
              <Link
                className="vs-mkt-secondary-btn w-full sm:w-auto whitespace-nowrap rounded-full border border-[#b8872f]/30 bg-white/90 px-6 sm:px-7 py-3 sm:py-3.5 text-center text-sm font-bold uppercase tracking-[0.14em] text-[#825b18] shadow-sm backdrop-blur-sm transition-all hover:border-[#b8872f] hover:bg-[#fffcf7] hover:text-[#6a4910]"
                href="/g/home"
              >
                {t.guestBtn}
              </Link>
            </div>
            {children}
          </div>
          <div className="vs-hero-device relative min-w-0" data-parallax>
            <div className="vs-device-float">
              <div className="vs-device-card overflow-hidden rounded-[1.75rem] border border-[#b8872f]/20 bg-white shadow-[0_20px_60px_rgba(184,135,47,0.12)]">
                {/* Header: Luxury Gold Gradient with white brand circle & gold status pill */}
                <div className="relative overflow-hidden bg-gradient-to-r from-[#7a5518] via-[#9e7123] to-[#c59639] px-4 py-3 sm:px-5 sm:py-3.5">
                  <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" aria-hidden="true" />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white p-1.5 shadow-sm">
                        <VietSageBrand variant="mark" className="h-6 w-6" markClassName="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm sm:text-base font-bold leading-tight text-white">{t.assistantTitle}</h2>
                        <p className="mt-0.5 text-xs text-[#fef3c7]">{t.assistantSubtitle}</p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-xs font-semibold text-[#fef9c3] backdrop-blur-sm">
                      <span className="h-2 w-2 rounded-full bg-[#fde047]" aria-hidden="true" />
                      {t.assistantStatus}
                    </span>
                  </div>
                </div>

                {/* White body panel */}
                <div className="bg-white p-3.5 sm:p-4.5">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#181410]">
                      {t.deviceHeading}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#6b6255]">
                      {t.deviceSub}
                    </p>
                  </div>

                  {/* Prompt bar */}
                  <Link
                    href="/g/home"
                    className="group mt-2.5 flex min-h-10 items-center gap-2 rounded-xl border border-[#b8872f]/20 bg-[#fdfbf7] px-3 py-2 text-xs text-[#5c5040] transition-all hover:border-[#b8872f]/45 hover:bg-[#faf4e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] sm:text-sm"
                  >
                    <Image src="/images/concierge/icon-ai.png" alt="" width={18} height={18} className="h-4.5 w-4.5 shrink-0 rounded object-contain" />
                    <span className="min-w-0 flex-1 truncate text-[#6b6255]">
                      {t.promptPlaceholder}
                    </span>
                    <VsIcon name="chevron_right" className="shrink-0 text-sm text-[#b8872f]/70 transition-transform group-hover:translate-x-0.5" />
                  </Link>

                  {/* 2x2 Services Grid */}
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {services.map((service) => (
                      <Link
                        key={service.title}
                        href={service.href}
                        className="group flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#b8872f]/15 bg-[#fffefc] p-2 sm:p-2.5 transition-all hover:border-[#b8872f]/40 hover:bg-[#fefaf2] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f]"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Image src={service.icon} alt="" width={38} height={38} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                          <div className="min-w-0">
                            <h4 className="whitespace-nowrap text-xs sm:text-sm font-bold text-[#181410] transition-colors group-hover:text-[#8a5d1b]">{service.title}</h4>
                            <p className="mt-0.5 truncate text-xs text-[#6b6255]">{service.text}</p>
                          </div>
                        </div>
                        <VsIcon name="arrow_forward" className="shrink-0 text-sm text-[#b8872f]/40 transition-all group-hover:translate-x-0.5 group-hover:text-[#8a5d1b]" />
                      </Link>
                    ))}
                  </div>

                  {/* Bottom Experience Card: Luxury Gold Gradient */}
                  <div className="relative mt-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-[#704d13] via-[#94691f] to-[#b8872f] p-3 text-white shadow-md shadow-[#94691f]/15">
                    <div className="pointer-events-none absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-white/10 blur-xl" aria-hidden="true" />
                    <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white">
                          <VietSageBrand variant="mark" className="h-5 w-5" markClassName="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="truncate text-xs sm:text-sm font-bold text-white">
                            {t.experienceTitle}
                          </h4>
                          <p className="mt-0.5 truncate text-xs text-[#fef3c7]">
                            {t.experienceDesc}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-2.5 py-1.5 backdrop-blur-md">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-white">
                          <VsIcon name="concierge" className="text-xs" />
                        </span>
                        <div className="text-left">
                          <p className="text-xs font-semibold uppercase tracking-wider text-white/80 leading-none">
                            {t.responseLabel}
                          </p>
                          <p className="mt-0.5 text-xs sm:text-sm font-bold text-white leading-none">
                            {t.responseTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <a className="vs-scroll-cue" href="#concierge" aria-label="Cuộn đến phần E-Concierge">
        <span>{t.scrollCue}</span><i aria-hidden="true" />
      </a>
    </section>
  );
}

export function CardGrid({ items, reveal = "scale" }: { items: CardItem[]; reveal?: "scale" | "from-left" | "from-right" }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <article key={item.title} data-reveal={reveal} data-reveal-order={index % 3} className="vs-mkt-card rounded-[1.7rem] border border-[#123d2a]/10 bg-white/78 p-6 shadow-xl shadow-[#123d2a]/6">
          <div className="mb-5 h-2 w-16 rounded-full bg-[#d7a84d]" />
          <h3 className="text-xl sm:text-2xl font-bold text-[#123d2a]">{item.title}</h3>
          <p className="mt-3 text-sm sm:text-base leading-6 sm:leading-7 text-[#627064]">{item.text}</p>
        </article>
      ))}
    </div>
  );
}

export function CTA({ locale = "vi" }: { locale?: MarketingLocale } = {}) {
  const activeLocale = normalizeLocale(locale);
  const t = SHELL_COPY[activeLocale] ?? SHELL_COPY.vi;

  return (
    <section className="px-5 py-16 lg:px-8">
      <div data-reveal="cta" className="vs-cta-panel relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#123d2a] p-8 text-white shadow-2xl shadow-[#123d2a]/20 md:p-12">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#f3c66b]">{t.ctaEyebrow}</p>
            <h2 className="vs-display mt-3 text-2xl font-semibold leading-tight sm:text-3xl md:text-4xl lg:text-[2.2rem] xl:text-[2.5rem] tracking-tight xl:whitespace-nowrap">
              {t.ctaTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-sm sm:text-base text-white/75">
              {t.ctaText}
            </p>
          </div>
          <a
            href={REQUEST_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#f3c66b] px-7 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-[#123d2a] transition-all hover:bg-[#ffe088]"
          >
            {t.ctaBtn}
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer({ locale = "vi" }: { locale?: MarketingLocale }) {
  const activeLocale = normalizeLocale(locale);
  const t = SHELL_COPY[activeLocale] ?? SHELL_COPY.vi;
  const cols = t.footerCols;

  return (
    <footer className="border-t border-[#123d2a]/10 bg-[#10251a] px-5 py-12 text-white lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_2fr]">
        <div>
          <VietSageBrand
            variant="wordmark"
            className="rounded-xl px-3 py-2"
            wordmarkClassName="h-7 w-auto"
          />
          <p className="mt-4 max-w-sm text-sm text-white/65">
            {t.footerTagline}
          </p>
          <p className="mt-6 text-xs text-white/45">
            {t.footerCopyright}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {cols.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-bold text-[#f3c66b]">{col.heading}</h3>
              <div className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <Link key={link.label} href={link.href} className="block text-sm text-white/65 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
