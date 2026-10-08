"use client";

import { useEffect, useState } from "react";

import {
  CardGrid,
  CTA as Cta,
  Hero,
  MarketingShell,
  SectionHeader,
} from "@/components/marketing/marketing-shell";
import { normalizeLocale, type SupportedLocale } from "@/core/i18n/locales";
import { PublicLocalMateChat } from "@/features/localmate-public/components/public-localmate-chat";

export const marketingMetadata = {
  title: "VietSage | Nền tảng trợ lý số tại phòng",
  description:
    "VietSage cung cấp giải pháp trợ lý số tại phòng qua mã QR, tiếp nhận và điều phối dịch vụ tức thì, hỗ trợ đa ngôn ngữ và nâng tầm trải nghiệm khách lưu trú mà không thay thế hệ thống PMS.",
};

type HomeCopy = {
  stats: Array<[string, string]>;
  trustStrip: {
    heading: string;
    items: string[];
  };
  hero: {
    eyebrow: string;
    title: string;
    text: string;
  };
  concierge: {
    watermark: string;
    eyebrow: string;
    title: string;
    text: string;
    solutions: Array<{ title: string; text: string }>;
  };
  operations: {
    watermark: string;
    eyebrow: string;
    title: string;
    text: string;
    moments: string[];
  };
  visibility: {
    watermark: string;
    eyebrow: string;
    title: string;
    text: string;
    why: Array<{ title: string; text: string }>;
  };
  faqs: {
    eyebrow: string;
    title: string;
    text: string;
    items: Array<[string, string]>;
  };
};

const HOME_COPY: Record<SupportedLocale, HomeCopy> = {
  vi: {
    stats: [
      ["24/7", "trợ lý số tại phòng"],
      ["QR", "không cần tải ứng dụng"],
      ["Tức thì", "tự động điều phối"],
      ["Đa ngữ", "hỗ trợ khách quốc tế"],
    ],
    trustStrip: {
      heading: "Tối ưu trải nghiệm thực tế của khách lưu trú thay vì quản trị dữ liệu cồng kềnh",
      items: ["QR TẠI PHÒNG", "VẬT DỤNG PHÒNG", "ẨM THỰC TẠI PHÒNG", "CẨM NANG ĐỊA PHƯƠNG"],
    },
    hero: {
      eyebrow: "Trợ lý E-Concierge số tại từng phòng nghỉ",
      title: "Kết nối lễ tân, buồng phòng và trải nghiệm lưu trú trong một quy trình liền mạch.",
      text: "VietSage mang đến giải pháp trợ lý QR thông minh hỗ trợ vật dụng phòng, ẩm thực tại phòng, dịch vụ buồng phòng, cẩm nang địa phương và đa ngôn ngữ; đồng thời giúp nhân viên phân luồng và xử lý từng yêu cầu nhanh chóng, chuẩn xác.",
    },
    concierge: {
      watermark: "LƯU TRÚ",
      eyebrow: "Giải pháp chuyên biệt từ VietSage",
      title: "Số hóa mọi điểm chạm trong suốt kỳ lưu trú của khách.",
      text: "Thay vì quản trị dữ liệu như CRM truyền thống, VietSage tập trung xử lý nhu cầu thực tế: khách cần gì, bộ phận nào tiếp nhận và phục vụ nhanh nhất.",
      solutions: [
        {
          title: "Trợ lý số tại phòng qua mã QR",
          text: "Khách chỉ cần quét mã QR đặt tại phòng để yêu cầu khăn tắm, vật dụng cá nhân, buồng phòng, ẩm thực hay cẩm nang địa phương mà không cần tải ứng dụng.",
        },
        {
          title: "Tự động điều phối tác vụ",
          text: "Mọi yêu cầu được chuyển đến đúng bộ phận phụ trách kèm số phòng, mức ưu tiên, ngôn ngữ của khách và cập nhật theo thời gian thực.",
        },
        {
          title: "Nâng tầm trải nghiệm lưu trú",
          text: "Đóng vai trò như một bàn E-Concierge số tinh gọn ngay tại phòng: chuẩn xác, cao cấp, hỗ trợ đa ngôn ngữ và luôn sẵn sàng phục vụ 24/7.",
        },
      ],
    },
    operations: {
      watermark: "VẬN HÀNH",
      eyebrow: "03 / Kết nối tức thì từ phòng đến nhân sự",
      title: "Chuyển hóa mọi yêu cầu tại phòng thành tác vụ chính xác.",
      text: "VietSage mang đến công cụ hỗ trợ tinh gọn, chuyên nghiệp, giúp khách luôn an tâm được phục vụ chu đáo mà không gây quá tải cho nhân viên qua các cuộc gọi dồn dập.",
      moments: [
        "Khách cần bổ sung khăn tắm và vật dụng sau khi nhận phòng, gửi yêu cầu tức thì qua mã QR đặt tại phòng.",
        "Gia đình đặt dịch vụ ẩm thực tại phòng thuận tiện mà không cần chờ máy tổng đài trong khung giờ cao điểm.",
        "Khách quốc tế tra cứu hướng dẫn trả phòng (check-out) và chính sách khách sạn bằng chính ngôn ngữ của họ một cách chuẩn xác.",
      ],
    },
    visibility: {
      watermark: "MINH BẠCH",
      eyebrow: "Tại sao chọn VietSage",
      title: "Giải tỏa áp lực lễ tân. Nâng chuẩn tiện nghi phòng. Tối ưu hiệu suất vận hành.",
      text: "Khách sạn tiếp tục duy trì hệ thống PMS hiện có, đồng thời trang bị thêm nền tảng số hóa tại phòng giúp nâng cao mức độ hài lòng của khách và tối ưu năng lực phối hợp giữa các bộ phận.",
      why: [
        {
          title: "Chuyên biệt cho trải nghiệm lưu trú",
          text: "VietSage không cạnh tranh với các hệ thống CRM quản lý tiếp thị; nền tảng tập trung giải quyết tức thì mọi nhu cầu phát sinh thực tế của khách trong suốt thời gian lưu trú.",
        },
        {
          title: "Giải tỏa áp lực quầy lễ tân",
          text: "Chuyển các yêu cầu dịch vụ thường gặp và thắc mắc của khách từ cuộc gọi tổng đài hoặc hàng chờ tiền sảnh sang luồng tự phục vụ nhanh gọn ngay tại phòng.",
        },
        {
          title: "Nâng chuẩn tiện nghi & riêng tư",
          text: "Khách chủ động gửi yêu cầu nhanh chóng và riêng tư; nhân viên tiếp nhận phiếu công việc chuẩn hóa thay vì ghi nhận thủ công qua điện thoại hay tin nhắn rời rạc.",
        },
        {
          title: "Giao tiếp đa ngôn ngữ",
          text: "Khách quốc tế dễ dàng nắm rõ dịch vụ và gửi yêu cầu bằng chính tiếng mẹ đẻ; hệ thống tự động dịch thuật giúp đội ngũ vận hành xử lý thông suốt, loại bỏ hiểu nhầm.",
        },
        {
          title: "Minh bạch dữ liệu vận hành",
          text: "Ban quản lý và chủ đầu tư dễ dàng theo dõi tần suất yêu cầu, thời gian đáp ứng (SLA), nhu cầu thực tế của khách và hiệu suất từng bộ phận theo thời gian thực.",
        },
        {
          title: "Tương thích hoàn hảo với PMS",
          text: "VietSage đóng vai trò là lớp giao tiếp trải nghiệm khách (Guest Experience Layer) song hành cùng hệ sinh thái PMS sẵn có, nâng cấp chất lượng phục vụ mà không làm gián đoạn hệ thống cốt lõi.",
        },
      ],
    },
    faqs: {
      eyebrow: "Câu hỏi thường gặp",
      title: "Giải đáp thắc mắc trước khi trải nghiệm bản demo.",
      text: "VietSage được phát triển chuyên sâu cho dịch vụ tại phòng và tối ưu vận hành khách sạn, khác biệt hoàn toàn với các phần mềm CRM phổ thông.",
      items: [
        [
          "VietSage có thay thế hệ thống PMS hoặc CRM hiện tại không?",
          "Không. VietSage là lớp trải nghiệm khách lưu trú (Guest Experience Layer) và trợ lý E-Concierge tại phòng. Nền tảng hoạt động song hành, bổ trợ hoàn hảo cho hệ thống PMS sẵn có nhằm giải quyết bài toán tiếp nhận dịch vụ, hỗ trợ đa ngôn ngữ và chuẩn hóa quy trình phục vụ tại phòng.",
        ],
        [
          "Khách lưu trú có cần cài đặt ứng dụng không?",
          "Hoàn toàn không. Khách chỉ cần quét mã QR tại phòng bằng camera điện thoại để truy cập ngay web-app dịch vụ, thao tác nhanh chóng mà không cần tải hay cài đặt bất kỳ ứng dụng nào.",
        ],
        [
          "Đội ngũ vận hành khách sạn nhận và xử lý yêu cầu ra sao?",
          "Các bộ phận liên quan (Lễ tân, Buồng phòng, F&B...) tiếp nhận phiếu yêu cầu chuẩn hóa theo số phòng, danh mục dịch vụ, độ ưu tiên và được dịch tự động về tiếng Việt, giúp phân công công việc minh bạch và phản hồi tức thì.",
        ],
      ],
    },
  },
  en: {
    stats: [
      ["24/7", "in-room digital assistant"],
      ["QR", "no app download needed"],
      ["Instant", "automated dispatch"],
      ["Multilingual", "international guests"],
    ],
    trustStrip: {
      heading: "Optimizing actual guest stay experience instead of cumbersome database management",
      items: ["IN-ROOM QR", "ROOM AMENITIES", "IN-ROOM DINING", "LOCAL GUIDE"],
    },
    hero: {
      eyebrow: "Digital in-room E-Concierge assistant",
      title: "Connect front desk, housekeeping, and guest stay experience in one seamless flow.",
      text: "VietSage delivers a smart QR assistant for amenities, in-room dining, housekeeping, local guides, and multilingual support—empowering staff to route and resolve requests swiftly and accurately.",
    },
    concierge: {
      watermark: "STAY",
      eyebrow: "Dedicated Solutions from VietSage",
      title: "Digitize every touchpoint throughout the guest stay.",
      text: "Instead of cumbersome traditional CRM data entry, VietSage focuses on actual guest needs: what they need, and which team handles it fastest.",
      solutions: [
        {
          title: "In-room Digital Assistant via QR",
          text: "Guests simply scan the in-room QR code to request towels, amenities, housekeeping, dining, or local guides—no app download needed.",
        },
        {
          title: "Automated Task Dispatch",
          text: "Every request is routed to the right team with room number, priority, guest language, and real-time updates.",
        },
        {
          title: "Elevate the Guest Experience",
          text: "Acts as a refined digital E-Concierge right in the room: precise, premium, multilingual, and available 24/7.",
        },
      ],
    },
    operations: {
      watermark: "OPERATIONS",
      eyebrow: "03 / Instant Room-to-Staff Connection",
      title: "Turn every in-room request into an accurate task.",
      text: "VietSage delivers a streamlined, professional tool that gives guests peace of mind while preventing staff burnout from nonstop phone calls.",
      moments: [
        "Guests needing extra towels and amenities after check-in send an instant request via the in-room QR code.",
        "Families conveniently order in-room dining without waiting on hold with the operator during peak hours.",
        "International travelers look up check-out guides and hotel policies accurately in their own native language.",
      ],
    },
    visibility: {
      watermark: "VISIBILITY",
      eyebrow: "Why Choose VietSage",
      title: "Relieve front desk load. Elevate in-room comfort. Maximize operational efficiency.",
      text: "Hotels keep their existing PMS while adopting an in-room digital layer that lifts guest satisfaction and streamlines cross-department coordination.",
      why: [
        {
          title: "Focused on the Stay Experience",
          text: "VietSage does not compete with marketing CRMs; it focuses strictly on resolving real, spontaneous guest requests during their stay.",
        },
        {
          title: "Relieve Front Desk Pressure",
          text: "Shifts routine service requests and queries from phone lines or lobby queues into smooth in-room self-service.",
        },
        {
          title: "Elevate Convenience & Privacy",
          text: "Guests send requests privately and swiftly; staff receive standardized work tickets instead of scribbling notes from fragmented calls or chats.",
        },
        {
          title: "Seamless Multilingual Communication",
          text: "International guests explore services and send requests in their mother tongue; automatic translation keeps staff coordination smooth and error-free.",
        },
        {
          title: "Operational Data Transparency",
          text: "Managers and owners easily monitor request frequency, response SLAs, actual guest preferences, and team performance in real time.",
        },
        {
          title: "Flawless PMS Compatibility",
          text: "VietSage acts as a Guest Experience Layer alongside your current PMS, upgrading service quality without disrupting core workflows.",
        },
      ],
    },
    faqs: {
      eyebrow: "Frequently Asked Questions",
      title: "Answers to common questions before your demo.",
      text: "VietSage is specifically engineered for in-room guest services and hotel operational efficiency, distinct from generic CRM software.",
      items: [
        [
          "Does VietSage replace our existing PMS or CRM system?",
          "No. VietSage is a Guest Experience Layer and digital in-room E-Concierge. It runs alongside and complements your current PMS to streamline service intake, multilingual communication, and standardized in-room workflows.",
        ],
        [
          "Do guests need to download an app?",
          "Not at all. Guests simply scan the in-room QR code with their phone camera to instantly open the web app—fast and seamless without any app install.",
        ],
        [
          "How does hotel staff receive and resolve requests?",
          "Relevant departments (Front Desk, Housekeeping, F&B) receive standardized tickets with room number, service type, and priority, auto-translated to the staff's preferred language for swift, transparent action.",
        ],
      ],
    },
  },
  zh: {
    stats: [
      ["24/7", "客房专属数字助理"],
      ["QR", "免下载任何应用"],
      ["即时", "自动化派单响应"],
      ["多语言", "服务国际宾客"],
    ],
    trustStrip: {
      heading: "专注于提升住客现场真实体验，告别繁重低效的数据录入",
      items: ["客房专属QR", "客房备品补充", "客房送餐服务", "当地游玩向导"],
    },
    hero: {
      eyebrow: "每间客房的专属数字化 E-Concierge 礼宾助手",
      title: "将前台接待、客房保洁与住客服务紧密串联为一体化流畅体验。",
      text: "VietSage 提供智能客房二维码助手，涵盖物品补充、客房送餐、保洁服务、当地向导与多语言沟通；助力酒店员工快速分流、精准响应每项需求。",
    },
    concierge: {
      watermark: "客房体验",
      eyebrow: "VietSage 专属解决方案",
      title: "数字化住客旅程中的每一个关键服务触点。",
      text: "告别繁冗的传统 CRM 录入，VietSage 专注于解决真实即时需求：客人需要什么、由哪个部门最快派单完成。",
      solutions: [
        {
          title: "扫码即用的客房数字助手",
          text: "宾客只需扫描客房内的二维码，即可轻松索取毛巾、洗漱备品、呼叫保洁、点餐或查阅周边向导，无需下载应用。",
        },
        {
          title: "智能自动派单分流",
          text: "所有需求均会带上房间号、优先级与宾客语言，精准派发给对应岗位，并保持实时状态同步。",
        },
        {
          title: "升级高品质度假体验",
          text: "如同置身客房内的专属高端数字化礼宾台：精准、高雅、支持多语种沟通，全天候 24/7 守候。",
        },
      ],
    },
    operations: {
      watermark: "高效运营",
      eyebrow: "03 / 客房与服务人员即刻互联",
      title: "将客房发起的每一个需求，精准转化为执行工单。",
      text: "VietSage 提供轻量专业的协同工具，让宾客时刻感受贴心照料，同时避免前台电话持续轰炸造成的员工疲劳。",
      moments: [
        "客人办理入住后需要额外毛巾或用品，直接扫码客房二维码即可即刻提交申请。",
        "家庭旅客在高峰时段便捷点选用餐，无需长时间等待总机电话接通。",
        "国际宾客能够使用母语精准查阅退房指引与酒店各项政策，沟通零误解。",
      ],
    },
    visibility: {
      watermark: "数据透明",
      eyebrow: "为何选择 VietSage",
      title: "缓解前台接待压力，提升客房舒适标准，大幅提高运营效能。",
      text: "酒店继续使用现有的 PMS 系统，同时部署客房数字化交互层，显著提升宾客满意度与跨部门协同能力。",
      why: [
        {
          title: "专为客房在住体验打造",
          text: "VietSage 不与营销型 CRM 竞争，而是全力解决宾客在住期间产生的真实即时需求。",
        },
        {
          title: "有效释放前台与总机压力",
          text: "将常见服务诉求与问询从电话或前台排队，转移到客房内快速顺畅的自助流程。",
        },
        {
          title: "提升私密性与服务品质",
          text: "宾客能够私密快捷地提交需求；服务人员接收标准化派单，避免零散电话或口头传达带来的疏漏。",
        },
        {
          title: "多语种跨语言畅通交互",
          text: "国际客人可用母语查看服务并提交请求；系统自动翻译，确保酒店团队理解精准，消除语言误会。",
        },
        {
          title: "运营数据全面透明清晰",
          text: "管理层与投资人可实时掌握需求频次、SLA 响应时效、宾客偏好与各部门的实际执行效率。",
        },
        {
          title: "与现有 PMS 深度兼容互补",
          text: "VietSage 作为与现有 PMS 并行的宾客体验层，在不中断核心业务系统的前提下全面升级服务水准。",
        },
      ],
    },
    faqs: {
      eyebrow: "常见问题解答",
      title: "在体验系统演示前，为您解答关键疑问。",
      text: "VietSage 专门针对客房就地服务与酒店高效运营打造，截然不同于通用型传统 CRM 软件。",
      items: [
        [
          "VietSage 是否会取代酒店现有的 PMS 或 CRM 系统？",
          "不会。VietSage 是客房在住体验层（Guest Experience Layer）与数字化礼宾。它与现有 PMS 并行运作、完美互补，专注于解决服务即时接单、多语言支持与客房标准化履约。",
        ],
        [
          "住客需要下载安装 App 吗？",
          "完全不需要。客人只需用手机自带相机扫描客房二维码，即可即刻打开服务页面，无需任何安装。",
        ],
        [
          "酒店运营团队如何接收并处理宾客诉求？",
          "相关部门（前台、客房、餐饮等）会接收到带有房间号、类别与优先级的标准化任务工单，并自动翻译，分工透明、响应迅捷。",
        ],
      ],
    },
  },
  ko: {
    stats: [
      ["24/7", "객실 전용 디지털 비서"],
      ["QR", "앱 설치 불필요"],
      ["즉각적", "자동 업무 배정"],
      ["다국어", "외국인 고객 지원"],
    ],
    trustStrip: {
      heading: "복잡한 데이터 관리 대신 투숙객의 실제 체류 경험을 최적화합니다",
      items: ["객실 QR", "객실 비품", "인룸 다이닝", "로컬 가이드"],
    },
    hero: {
      eyebrow: "각 객실마다 제공되는 디지털 E-Concierge 비서",
      title: "프런트 데스크, 하우스키핑, 투숙객 경험을 하나의 매끄러운 흐름으로 연결합니다.",
      text: "VietSage는 객실 비품, 룸서비스, 청소 요청, 로컬 가이드 및 다국어 지원을 제공하는 스마트 QR 비서를 통해 직원들이 신속하고 정확하게 요청을 처리할 수 있도록 지원합니다.",
    },
    concierge: {
      watermark: "투숙 경험",
      eyebrow: "VietSage 맞춤형 솔루션",
      title: "투숙 기간 동안의 모든 서비스 접점을 디지털화합니다.",
      text: "전통적인 CRM 데이터 입력 대신, VietSage는 투숙객의 실제 요구에 집중합니다: 필요한 서비스와 가장 빠른 응답 부서 연결.",
      solutions: [
        {
          title: "QR 기반 객실 디지털 비서",
          text: "앱 설치 없이 객실 내 QR 코드를 스캔하여 타월, 비품, 청소, 룸서비스 또는 로컬 가이드를 간편하게 요청할 수 있습니다.",
        },
        {
          title: "자동 업무 배정 및 조율",
          text: "모든 요청은 객실 번호, 우선순위, 고객 언어 정보와 함께 담당 부서로 실시간 전달됩니다.",
        },
        {
          title: "체류 경험의 품격 향상",
          text: "객실 내 스마트 디지털 컨시어지로서 정확하고 품격 있는 다국어 서비스를 24시간 연중무휴 제공합니다.",
        },
      ],
    },
    operations: {
      watermark: "현장 운영",
      eyebrow: "03 / 객실과 직원의 즉각적인 연결",
      title: "객실의 모든 요청을 정확한 업무 티켓으로 전환합니다.",
      text: "VietSage는 전화 업무 과부하 없이 고객에게 세심한 서비스를 제공할 수 있는 간결하고 전문적인 도구를 제공합니다.",
      moments: [
        "체크인 후 타월이나 비품이 필요한 고객이 객실 내 QR 코드를 통해 즉시 요청을 보냅니다.",
        "가족 단위 투숙객이 혼잡한 시간에도 전화 대기 없이 편리하게 룸서비스를 주문합니다.",
        "외국인 고객이 자신의 모국어로 체크아웃 안내와 호텔 규정을 정확하게 확인합니다.",
      ],
    },
    visibility: {
      watermark: "투명한 지표",
      eyebrow: "VietSage를 선택해야 하는 이유",
      title: "프런트 업무 부담 완화, 객실 편의성 향상, 현장 운영 효율 극대화.",
      text: "기존 PMS 시스템을 그대로 유지하면서 객실 디지털 레이어를 추가하여 고객 만족도를 높이고 부서 간 협업을 최적화합니다.",
      why: [
        {
          title: "체류 경험에 특화된 솔루션",
          text: "마케팅용 CRM과 경쟁하지 않고, 투숙객이 머무는 동안 발생하는 실질적 요구를 즉시 해결하는 데 집중합니다.",
        },
        {
          title: "프런트 데스크 업무 부담 경감",
          text: "자주 발생하는 요청과 문의를 전화 대기나 로비 대기열 대신 객실 내 빠른 셀프서비스로 전환합니다.",
        },
        {
          title: "편의성 및 프라이버시 기준 향상",
          text: "고객은 프라이버시를 지키며 요청하고, 직원은 파편화된 메모 대신 표준화된 티켓으로 접수합니다.",
        },
        {
          title: "원활한 다국어 실시간 소통",
          text: "외국인 고객이 모국어로 요청을 보내면 시스템이 자동 번역하여 직원들이 오해 없이 처리합니다.",
        },
        {
          title: "운영 데이터의 투명한 시각화",
          text: "관리자와 오너가 요청 빈도, SLA 응답 시간, 고객 선호도 및 부서별 성과를 실시간 모니터링합니다.",
        },
        {
          title: "기존 PMS와의 완벽한 호환",
          text: "기존 PMS 생태계와 나란히 작동하는 투숙객 경험 레이어로서, 핵심 시스템 중단 없이 서비스 품질을 업그레이드합니다.",
        },
      ],
    },
    faqs: {
      eyebrow: "자주 묻는 질문",
      title: "데모를 체험하시기 전 궁금한 점을 확인하세요.",
      text: "VietSage는 일반 CRM과 완전히 차별화되어 객실 서비스와 호텔 현장 운영에 깊이 특화되어 있습니다.",
      items: [
        [
          "VietSage가 기존 PMS나 CRM을 대체하나요?",
          "아닙니다. VietSage는 기존 PMS와 공존하며 보완하는 객실 투숙객 경험 레이어입니다. 서비스 접수, 다국어 지원, 표준화된 객실 서비스를 완벽히 보완합니다.",
        ],
        [
          "투숙객이 별도의 앱을 설치해야 하나요?",
          "전혀 필요하지 않습니다. 스마트폰 카메라로 객실 내 QR 코드를 스캔하기만 하면 즉시 웹앱에 접속할 수 있습니다.",
        ],
        [
          "호텔 운영팀은 요청을 어떻게 접수하고 처리하나요?",
          "관련 부서(프런트, 하우스키핑, F&B 등)가 객실 번호와 우선순위가 표기된 표준화된 티켓을 실시간으로 확인하여 신속히 처리합니다.",
        ],
      ],
    },
  },
  ru: {
    stats: [
      ["24/7", "цифровой помощник в номере"],
      ["QR", "без установки приложений"],
      ["Мгновенно", "автоматическое распределение"],
      ["Многоязычный", "поддержка гостей"],
    ],
    trustStrip: {
      heading: "Оптимизация реального опыта гостей вместо громоздкого управления данными",
      items: ["QR В НОМЕРЕ", "ПРИНАДЛЕЖНОСТИ", "ПИТАНИЕ В НОМЕРЕ", "ГИД ПО ГОРОДУ"],
    },
    hero: {
      eyebrow: "Цифровой консьерж в каждом номере",
      title: "Объедините ресепшн, клининг и сервис для гостей в единый бесшовный процесс.",
      text: "VietSage предоставляет умного QR-ассистента для заказа принадлежностей, еды в номер, уборки, гидов и мультиязычной поддержки, ускоряя обработку всех запросов.",
    },
    concierge: {
      watermark: "ПРОЖИВАНИЕ",
      eyebrow: "Специализированные решения VietSage",
      title: "Оцифруйте каждую точку взаимодействия с гостем.",
      text: "Вместо сложного традиционного CRM, VietSage фокусируется на реальных потребностях гостей и мгновенной передаче задач.",
      solutions: [
        {
          title: "Цифровой помощник в номере по QR",
          text: "Гости сканируют QR-код в номере для заказа полотенец, уборки или еды — без установки приложений.",
        },
        {
          title: "Автоматическая диспетчеризация",
          text: "Каждый запрос направляется в нужный отдел с указанием номера комнаты, приоритета и языка гостя.",
        },
        {
          title: "Повышение уровня комфорта",
          text: "Цифровой консьерж прямо в номере: точность, премиальный сервис, многоязычность 24/7.",
        },
      ],
    },
    operations: {
      watermark: "ОПЕРАЦИИ",
      eyebrow: "03 / Мгновенная связь номера с персоналом",
      title: "Превратите любой запрос из номера в четкую задачу.",
      text: "VietSage дает персоналу четкие задачи, избавляя от бесконечных телефонных звонков.",
      moments: [
        "Гости запрашивают дополнительные полотенца и принадлежности через QR-код в номере сразу после заселения.",
        "Семьи заказывают еду в номер в часы пик без ожидания ответа оператора по телефону.",
        "Иностранные гости читают правила выезда и отеля на своем родном языке без недопонимания.",
      ],
    },
    visibility: {
      watermark: "ПРОЗРАЧНОСТЬ",
      eyebrow: "Почему выбирают VietSage",
      title: "Снизьте нагрузку на ресепшн. Повысьте комфорт. Оптимизируйте процессы.",
      text: "Отель сохраняет текущую PMS, добавляя цифровой сервис для гостей и слаженной работы отделов.",
      why: [
        {
          title: "Фокус на комфорте проживания",
          text: "VietSage не заменяет CRM, а решает реальные оперативные задачи гостей во время проживания.",
        },
        {
          title: "Разгрузка стойки регистрации",
          text: "Переводит рутинные запросы из телефонных звонков в быстрый сервис самообслуживания в номере.",
        },
        {
          title: "Новый стандарт приватности",
          text: "Гости отправляют запросы конфиденциально, а сотрудники получают стандартизированные задачи.",
        },
        {
          title: "Многоязычная коммуникация",
          text: "Иностранные гости используют родной язык, а автоперевод помогает персоналу работать без ошибок.",
        },
        {
          title: "Прозрачность данных операций",
          text: "Руководство отслеживает частоту запросов, SLA и эффективность отделов в реальном времени.",
        },
        {
          title: "Полная совместимость с PMS",
          text: "VietSage работает как слой клиентского опыта вместе с PMS, не нарушая работу основных систем.",
        },
      ],
    },
    faqs: {
      eyebrow: "Часто задаваемые вопросы",
      title: "Ответы на популярные вопросы перед демо.",
      text: "VietSage разработан специально для обслуживания гостей в номерах и оптимизации операций.",
      items: [
        [
          "Заменяет ли VietSage существующую PMS или CRM?",
          "Нет. VietSage — это слой сервиса для гостей и цифровой консьерж, работающий параллельно с вашей PMS и дополняющий ее.",
        ],
        [
          "Нужно ли гостям устанавливать приложение?",
          "Вовсе нет. Гость просто сканирует QR-код камерой смартфона и сразу попадает в веб-сервис без установки приложений.",
        ],
        [
          "Как персонал отеля получает и обрабатывает запросы?",
          "Отделы отеля получают стандартизированные заявки с номером комнаты, категорией и приоритетом для быстрого реагирования.",
        ],
      ],
    },
  },
  hi: {
    stats: [
      ["24/7", "कमरे में डिजिटल सहायक"],
      ["QR", "ऐप डाउनलोड की जरूरत नहीं"],
      ["तत्काल", "स्वचालित कार्य वितरण"],
      ["बहुभाषी", "अंतरराष्ट्रीय मेहमानों के लिए"],
    ],
    trustStrip: {
      heading: "जटिल डेटा प्रबंधन के बजाय वास्तविक अतिथि अनुभव को अनुकूलित करना",
      items: ["कमरे में QR", "कमरे की सुविधाएं", "कमरे में भोजन", "स्थानीय गाइड"],
    },
    hero: {
      eyebrow: "प्रत्येक कमरे में डिजिटल ई-दरबान सहायक",
      title: "फ्रंट डेस्क, हाउसकीपिंग और अतिथि प्रवास अनुभव को एक निर्बाध प्रवाह में जोड़ें।",
      text: "VietSage एक स्मार्ट QR सहायक प्रदान करता है जो सुविधाओं, भोजन, हाउसकीपिंग, स्थानीय गाइड और बहुभाषी सहायता का समर्थन करता है।",
    },
    concierge: {
      watermark: "प्रवास",
      eyebrow: "VietSage के विशेष समाधान",
      title: "अतिथि के प्रवास के दौरान हर संपर्क बिंदु को डिजिटल बनाएं।",
      text: "पारंपरिक CRM के बजाय, VietSage वास्तविक जरूरतों पर ध्यान केंद्रित करता है: मेहमानों की क्या जरूरत है और कौन-सी टीम सबसे तेजी से सेवा देती है।",
      solutions: [
        {
          title: "QR के माध्यम से कमरे में डिजिटल सहायक",
          text: "मेहमान बिना किसी ऐप डाउनलोड के तौलिए, सफाई या भोजन का अनुरोध करने के लिए कमरे के QR कोड को स्कैन करते हैं।",
        },
        {
          title: "स्वचालित कार्य प्रेषण",
          text: "प्रत्येक अनुरोध कमरे की संख्या, प्राथमिकता और भाषा के साथ सही विभाग को भेजा जाता है।",
        },
        {
          title: "अतिथि अनुभव को उन्नत करें",
          text: "कमरे में एक डिजिटल ई-दरबान: सटीक, प्रीमियम, बहुभाषी और 24/7 उपलब्ध।",
        },
      ],
    },
    operations: {
      watermark: "संचालन",
      eyebrow: "03 / कमरे से कर्मचारियों का तत्काल संपर्क",
      title: "कमरे के हर अनुरोध को एक सटीक कार्य में बदलें।",
      text: "VietSage एक सुव्यवस्थित उपकरण प्रदान करता है जो कॉल के दबाव के बिना उत्कृष्ट सेवा सुनिश्चित करता है।",
      moments: [
        "चेक-इन के बाद अतिरिक्त तौलिए की आवश्यकता वाले मेहमान कमरे में QR कोड के माध्यम से अनुरोध भेजते हैं।",
        "परिवार व्यस्त समय में फोन लाइन पर प्रतीक्षा किए बिना कमरे में भोजन का ऑर्डर देते हैं।",
        "अंतरराष्ट्रीय यात्री अपनी भाषा में चेक-आउट गाइड और होटल नीतियों की जांच करते हैं।",
      ],
    },
    visibility: {
      watermark: "पारदर्शिता",
      eyebrow: "VietSage क्यों चुनें",
      title: "फ्रंट डेस्क का भार कम करें। कमरे की सुविधा बढ़ाएं। दक्षता अधिकतम करें।",
      text: "होटल अपने मौजूदा PMS को बनाए रखते हुए अतिथि संतुष्टि बढ़ाते हैं।",
      why: [
        {
          title: "प्रवास के अनुभव पर केंद्रित",
          text: "VietSage मार्केटिंग CRM से प्रतिस्पर्धा नहीं करता, बल्कि मेहमानों की वास्तविक जरूरतों को पूरा करता है।",
        },
        {
          title: "फ्रंट डेस्क का दबाव कम करें",
          text: "नियमित अनुरोधों को फोन कॉल या कतारों से कमरे में त्वरित स्वयं-सेवा में बदलें।",
        },
        {
          title: "सुविधा और गोपनीयता का नया स्तर",
          text: "मेहमान निजी तौर पर अनुरोध भेजते हैं; कर्मचारियों को मानकीकृत कार्य मिलते हैं।",
        },
        {
          title: "सहज बहुभाषी संचार",
          text: "अंतरराष्ट्रीय मेहमान अपनी मातृभाषा में अनुरोध भेजते हैं; स्वचालित अनुवाद गलतफहमी दूर करता है।",
        },
        {
          title: "परिचालन डेटा पारदर्शिता",
          text: "प्रबंधन वास्तविक समय में अनुरोध आवृत्ति, प्रतिक्रिया समय और प्रदर्शन को आसानी से ट्रैक करता है।",
        },
        {
          title: "PMS के साथ पूर्ण संगतता",
          text: "VietSage मौजूदा PMS के साथ एक अतिथि अनुभव परत के रूप में कार्य करता है।",
        },
      ],
    },
    faqs: {
      eyebrow: "अक्सर पूछे जाने वाले प्रश्न",
      title: "डेमो से पहले अक्सर पूछे जाने वाले सवालों के जवाब।",
      text: "VietSage विशेष रूप से कमरे की सेवा और होटल संचालन दक्षता के लिए बनाया गया है।",
      items: [
        [
          "क्या VietSage मौजूदा PMS या CRM को बदलता है?",
          "नहीं। VietSage मौजूदा PMS के साथ मिलकर सेवा और बहुभाषी सहायता को सुव्यवस्थित करता है।",
        ],
        [
          "क्या मेहमानों को ऐप डाउनलोड करने की आवश्यकता है?",
          "बिल्कुल नहीं। मेहमान बिना किसी ऐप इंस्टॉलेशन के तुरंत वेब-ऐप खोलने के लिए कमरे के QR कोड को स्कैन करते हैं।",
        ],
        [
          "होटल कर्मचारी अनुरोध कैसे प्राप्त और संसाधित करते हैं?",
          "संबंधित विभाग कमरे की संख्या और प्राथमिकता के साथ मानकीकृत टिकट प्राप्त करते हैं।",
        ],
      ],
    },
  },
};

export function MarketingHome({
  initialLocale = "vi",
}: {
  initialLocale?: SupportedLocale;
} = {}) {
  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const langParam = params.get("lang") ?? params.get("locale");
      if (langParam) {
        return normalizeLocale(langParam);
      }
    }
    return normalizeLocale(initialLocale);
  });

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const langParam = params.get("lang") ?? params.get("locale");
      if (langParam) {
        setCurrentLocale(normalizeLocale(langParam));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = currentLocale;
    }
  }, [currentLocale]);

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    setCurrentLocale(newLocale);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", newLocale);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const content = HOME_COPY[currentLocale] ?? HOME_COPY.vi;

  return (
    <MarketingShell locale={currentLocale} onLocaleChange={handleLocaleChange}>
      <Hero
        locale={currentLocale}
        eyebrow={content.hero.eyebrow}
        title={content.hero.title}
        text={content.hero.text}
      >
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {content.stats.map(([v, l], index) => (
            <div
              key={l}
              data-reveal="scale"
              data-reveal-order={index}
              className="vs-stat-card rounded-3xl border border-[#123d2a]/10 bg-white/70 p-4 shadow-sm shadow-[#123d2a]/5"
            >
              <strong className="text-2xl text-[#123d2a]">{v}</strong>
              <span className="block text-[10px] leading-4 uppercase tracking-[.1em] text-[#627064]">
                {l}
              </span>
            </div>
          ))}
        </div>
      </Hero>

      <section className="vs-trust-strip px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p data-reveal="fade" className="text-center text-xs font-black uppercase tracking-[.28em] text-[#b8872f]">
            {content.trustStrip.heading}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {content.trustStrip.items.map((item, index) => (
              <span
                key={item}
                data-reveal="scale"
                data-reveal-order={index}
                className="vs-logo-tile"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="concierge" data-scene="concierge" className="vs-cinematic-scene relative overflow-hidden px-5 py-24 lg:px-8 lg:py-32">
        <div className="vs-scene-watermark vs-scene-watermark-right" aria-hidden="true">{content.concierge.watermark}</div>
        <div className="relative mx-auto max-w-7xl">
          <SectionHeader
            eyebrow={content.concierge.eyebrow}
            title={content.concierge.title}
            text={content.concierge.text}
            reveal="from-left"
          />
          <div className="mt-12">
            <CardGrid items={content.concierge.solutions} />
          </div>
        </div>
      </section>

      <section id="operations" data-scene="operations" className="vs-cinematic-scene vs-operations-scene relative overflow-hidden px-5 py-14 sm:py-16 lg:py-20 lg:px-8">
        <div className="vs-scene-watermark" aria-hidden="true">{content.operations.watermark}</div>
        <div className="relative mx-auto grid max-w-7xl gap-6 sm:gap-8 lg:grid-cols-[0.92fr_1.08fr] items-center">
          <div data-reveal="from-left" className="vs-story-panel rounded-[2rem] p-6 sm:p-7 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f3c66b]">{content.operations.eyebrow}</p>
            <h2 className="vs-display mt-3.5 text-2xl sm:text-3xl lg:text-4xl xl:text-[2.5rem] font-bold leading-[1.16] tracking-[-0.025em] text-white [text-wrap:balance]">
              {content.operations.title}
            </h2>
            <p className="mt-3.5 text-sm sm:text-base text-white/75 leading-relaxed">
              {content.operations.text}
            </p>
          </div>
          <div className="grid gap-3 sm:gap-3.5">
            {content.operations.moments.map((moment, index) => (
              <article
                key={moment}
                data-reveal={index % 2 === 0 ? "from-right" : "scale"}
                data-reveal-order={index}
                className="vs-moment-card rounded-[1.6rem] px-5 py-4 sm:px-6 sm:py-4.5"
              >
                <span className="vs-moment-number">0{index + 1}</span>
                <p className="mt-2 sm:mt-2.5 text-sm sm:text-base lg:text-[1.05rem] font-semibold leading-relaxed text-white">
                  {moment}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="visibility" data-scene="visibility" className="vs-cinematic-scene relative overflow-hidden px-5 py-24 lg:px-8 lg:py-32">
        <div className="vs-scene-watermark vs-scene-watermark-right" aria-hidden="true">{content.visibility.watermark}</div>
        <div className="relative mx-auto max-w-7xl">
          <SectionHeader
            eyebrow={content.visibility.eyebrow}
            title={content.visibility.title}
            text={content.visibility.text}
            reveal="from-right"
          />
          <div className="mt-12">
            <CardGrid items={content.visibility.why} />
          </div>
        </div>
      </section>

      <section data-scene="visibility" className="px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow={content.faqs.eyebrow}
            title={content.faqs.title}
            text={content.faqs.text}
          />
          <div className="mt-10 space-y-3">
            {content.faqs.items.map(([q, a]) => (
              <details key={q} data-reveal="fade" className="vs-faq-item rounded-3xl bg-white/82 p-6 shadow-sm shadow-[#123d2a]/5">
                <summary className="cursor-pointer font-black text-[#123d2a]">
                  {q}
                </summary>
                <p className="mt-3 leading-7 text-[#627064]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <Cta locale={currentLocale} />
      <PublicLocalMateChat locale={currentLocale} onLocaleChange={handleLocaleChange} />
    </MarketingShell>
  );
}
