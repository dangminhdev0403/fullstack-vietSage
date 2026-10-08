import type { Metadata } from "next";
import { MarketingHome } from "@/app/_components/marketing-home";
import { normalizeLocale } from "@/core/i18n/locales";

import type { SupportedLocale } from "@/core/i18n/locales";

const TRANGCHU_METADATA: Record<
  SupportedLocale,
  { title: string; description: string; ogDescription: string }
> = {
  vi: {
    title: "VietSage | Nền tảng trợ lý số tại phòng",
    description:
      "VietSage cung cấp giải pháp trợ lý số tại phòng qua mã QR, tiếp nhận và điều phối dịch vụ tức thì, hỗ trợ đa ngôn ngữ và nâng tầm trải nghiệm khách lưu trú mà không thay thế hệ thống PMS.",
    ogDescription:
      "Lớp dịch vụ E-Concierge số tại phòng: tối ưu yêu cầu buồng phòng, ẩm thực tại phòng, điều phối tác vụ tức thì và hỗ trợ khách quốc tế đa ngôn ngữ.",
  },
  en: {
    title: "VietSage | Digital In-Room Assistant Platform",
    description:
      "VietSage delivers a smart in-room QR assistant for instant service dispatch, multilingual communication, and elevated guest stay experience alongside existing PMS.",
    ogDescription:
      "In-room digital E-Concierge: optimize housekeeping, in-room dining, instant dispatch, and multilingual guest communication.",
  },
  zh: {
    title: "VietSage | 客房数字化助理平台",
    description:
      "VietSage 通过客房二维码提供智能客房助理解决方案，即时派单、多语言支持，并在不取代现有 PMS 的前提下提升住客体验。",
    ogDescription:
      "客房数字化电子礼宾服务：优化客房送物、客房送餐、即时任务调度与多语言住客沟通。",
  },
  ko: {
    title: "VietSage | 객실 디지털 어시스턴트 플랫폼",
    description:
      "VietSage는 객실 QR 코드를 통해 즉각적인 서비스 디스패치, 다국어 지원 및 기존 PMS와의 원활한 연동을 제공하는 객실 디지털 어시스턴트 솔루션입니다.",
    ogDescription:
      "객실 내 디지털 E-컨시어지: 룸서비스, 하우스키핑, 실시간 작업 조율 및 다국어 게스트 지원 최적화.",
  },
  ru: {
    title: "VietSage | Цифровой ассистент для гостиничных номеров",
    description:
      "VietSage предоставляет решение цифрового ассистента в номере по QR-коду: мгновенная диспетчеризация, многоязычная поддержка и улучшение впечатлений гостей без замены PMS.",
    ogDescription:
      "Цифровой E-Concierge в номере: оптимизация хаускипинга, доставки в номер, мгновенная координация и многоязычное обслуживание.",
  },
  hi: {
    title: "VietSage | डिजिटल इन-रूम सहायक प्लेटफ़ॉर्म",
    description:
      "VietSage क्यूआर कोड के माध्यम से इन-रूम डिजिटल सहायक समाधान प्रदान करता है: तत्काल सेवा समन्वय, बहुभाषी समर्थन और मौजूदा PMS के साथ अतिथि अनुभव में सुधार।",
    ogDescription:
      "इन-रूम डिजिटल ई-दरबान: हाउसकीपिंग, इन-रूम डाइनिंग, तत्काल कार्य समन्वय और बहुभाषी संचार का अनुकूलन।",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string; locale?: string }>;
}): Promise<Metadata> {
  const resolved = await searchParams;
  const locale = normalizeLocale(resolved?.lang ?? resolved?.locale);
  const copy = TRANGCHU_METADATA[locale] ?? TRANGCHU_METADATA.vi;

  return {
    title: copy.title,
    description: copy.description,
    openGraph: {
      title: copy.title,
      description: copy.ogDescription,
      images: ["/brand/register-hero.png"],
    },
  };
}

export default async function TrangChuPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string; locale?: string }>;
}) {
  const resolved = await searchParams;
  const initialLocale = normalizeLocale(resolved?.lang ?? resolved?.locale);
  return <MarketingHome initialLocale={initialLocale} />;
}
