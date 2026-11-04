import { DEFAULT_LOCALE, type SupportedLocale } from "./locales";

export { DEFAULT_LOCALE };
export type Locale = SupportedLocale;

export type TranslationKey =
  | "errors.business.NO_ACTIVE_STAY"
  | "errors.business.QR_EXPIRED"
  | "errors.business.QR_REVOKED"
  | "errors.business.ACCESS_CLOSED"
  | "errors.business.GUEST_SESSION_LIMIT_REACHED"
  | "errors.business.VALIDATION_FAILED"
  | "errors.http.400"
  | "errors.http.401"
  | "errors.http.403"
  | "errors.http.404"
  | "errors.http.409"
  | "errors.http.422"
  | "errors.http.429"
  | "errors.http.500"
  | "errors.http.default"
  | "errors.network"
  | "errors.server"
  | "guest.emergency.eyebrow"
  | "guest.emergency.title"
  | "guest.emergency.description"
  | "guest.emergency.submit"
  | "guest.emergency.submitting"
  | "guest.emergency.success"
  | "guest.emergency.retry"
  | "guest.emergency.contactHotel";

type TranslationValues = Record<string, string | number>;

type TranslationDictionary = Record<TranslationKey, string>;

const vi: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "Phòng hiện chưa có lượt lưu trú đang hoạt động. Quý khách vui lòng liên hệ lễ tân để được hỗ trợ mở quyền truy cập.",
  "errors.business.QR_EXPIRED":
    "Mã QR này đã hết hạn sử dụng. Quý khách vui lòng quét mã QR mới hoặc liên hệ lễ tân.",
  "errors.business.QR_REVOKED":
    "Mã QR này hiện không còn khả dụng. Quý khách vui lòng liên hệ lễ tân để nhận mã mới.",
  "errors.business.ACCESS_CLOSED":
    "Dịch vụ hiện chưa khả dụng cho phòng này. Quý khách vui lòng liên hệ lễ tân để được hỗ trợ.",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "Phòng này đã đạt số lượng thiết bị truy cập tối đa. Quý khách vui lòng dùng thiết bị đã đăng nhập hoặc liên hệ lễ tân.",
  "errors.business.VALIDATION_FAILED":
    "Thông tin gửi lên chưa hợp lệ. Quý khách vui lòng kiểm tra lại và thử lần nữa.",
  "errors.http.400": "Yêu cầu chưa hợp lệ. Quý khách vui lòng kiểm tra thông tin và thử lại.",
  "errors.http.401": "Phiên làm việc đã hết hạn. Vui lòng quét lại mã QR.",
  "errors.http.403": "Quý khách không có quyền thực hiện thao tác này. Vui lòng liên hệ lễ tân nếu cần hỗ trợ.",
  "errors.http.404": "Không tìm thấy dữ liệu yêu cầu. Quý khách vui lòng thử lại hoặc liên hệ lễ tân.",
  "errors.http.409": "Dữ liệu đã thay đổi. Quý khách vui lòng tải lại trang và thử lần nữa.",
  "errors.http.422": "Thông tin gửi lên chưa hợp lệ. Quý khách vui lòng kiểm tra lại và thử lần nữa.",
  "errors.http.429": "Hệ thống đang nhận quá nhiều yêu cầu. Quý khách vui lòng chờ một chút rồi thử lại.",
  "errors.http.500": "Đã xảy ra sự cố. Vui lòng thử lại sau hoặc liên hệ lễ tân nếu cần hỗ trợ ngay.",
  "errors.http.default": "Yêu cầu chưa được xử lý. Quý khách vui lòng thử lại hoặc liên hệ lễ tân.",
  "errors.network": "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet rồi thử lại.",
  "errors.server": "Đã xảy ra sự cố. Vui lòng thử lại sau hoặc liên hệ lễ tân nếu cần hỗ trợ ngay.",
  "guest.emergency.eyebrow": "Khẩn cấp",
  "guest.emergency.title": "Gọi hỗ trợ khẩn cấp",
  "guest.emergency.description":
    "Hệ thống sẽ ghi nhận từng cuộc gọi riêng, gắn với phòng hiện tại và thông báo cho đội vận hành khách sạn.",
  "guest.emergency.submit": "Gọi 112",
  "guest.emergency.submitting": "Đang gửi...",
  "guest.emergency.success":
    "Đã ghi nhận cuộc gọi #{callId} trong sự cố #{incidentId}. Mức độ hiện tại: {severity}.",
  "guest.emergency.retry": "Thử lại",
  "guest.emergency.contactHotel": "Liên hệ lễ tân",
};

const en: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "There is currently no active stay for this room. Please contact reception to open access.",
  "errors.business.QR_EXPIRED":
    "This QR code has expired. Please scan a new QR code or contact reception.",
  "errors.business.QR_REVOKED":
    "This QR code is no longer valid. Please contact reception to receive a new code.",
  "errors.business.ACCESS_CLOSED":
    "Service is currently unavailable for this room. Please contact reception for assistance.",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "This room has reached the maximum number of connected devices. Please use an already logged-in device or contact reception.",
  "errors.business.VALIDATION_FAILED":
    "The submitted information is invalid. Please check and try again.",
  "errors.http.400": "Invalid request. Please check your information and try again.",
  "errors.http.401": "Your session has expired. Please scan the QR code again.",
  "errors.http.403": "You do not have permission to perform this action. Please contact reception if you need help.",
  "errors.http.404": "Requested data not found. Please try again or contact reception.",
  "errors.http.409": "Data has changed. Please refresh the page and try again.",
  "errors.http.422": "The submitted information is invalid. Please check and try again.",
  "errors.http.429": "The system is receiving too many requests. Please wait a moment and try again.",
  "errors.http.500": "Something went wrong. Please try again later or contact reception for immediate support.",
  "errors.http.default": "Request could not be processed. Please try again or contact reception.",
  "errors.network": "Cannot connect to server. Please check your internet connection and try again.",
  "errors.server": "Something went wrong. Please try again later or contact reception for immediate support.",
  "guest.emergency.eyebrow": "Emergency",
  "guest.emergency.title": "Emergency Assistance Call",
  "guest.emergency.description":
    "The system will log each call individually, link it to your current room, and alert the hotel operations team.",
  "guest.emergency.submit": "Call 112",
  "guest.emergency.submitting": "Sending...",
  "guest.emergency.success":
    "Logged call #{callId} for incident #{incidentId}. Current severity: {severity}.",
  "guest.emergency.retry": "Try again",
  "guest.emergency.contactHotel": "Contact reception",
};

const zh: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "该房间目前暂无有效入住记录。请联系前台以开通访问权限。",
  "errors.business.QR_EXPIRED":
    "此二维码已过期。请扫描新的二维码或联系前台。",
  "errors.business.QR_REVOKED":
    "此二维码已失效。请联系前台获取新码。",
  "errors.business.ACCESS_CLOSED":
    "该房间的服务暂不可用。请联系前台以获取协助。",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "该房间已达到最大设备连接数。请使用已登录设备或联系前台。",
  "errors.business.VALIDATION_FAILED":
    "提交的信息无效。请核对后重试。",
  "errors.http.400": "请求无效。请检查信息后重试。",
  "errors.http.401": "会话已过期。请重新扫描二维码。",
  "errors.http.403": "您无权执行此操作。如需帮助请联系前台。",
  "errors.http.404": "未找到请求的数据。请重试或联系前台。",
  "errors.http.409": "数据已发生变更。请刷新页面后重试。",
  "errors.http.422": "提交的信息无效。请核对后重试。",
  "errors.http.429": "系统请求过多，请稍候再试。",
  "errors.http.500": "发生异常。请稍后重试或联系前台以获得即时协助。",
  "errors.http.default": "请求未能处理。请重试或联系前台。",
  "errors.network": "无法连接到服务器。请检查网络连接后重试。",
  "errors.server": "发生异常。请稍后重试或联系前台以获得即时协助。",
  "guest.emergency.eyebrow": "紧急情况",
  "guest.emergency.title": "呼叫紧急援助",
  "guest.emergency.description":
    "系统将单独记录每次呼叫，关联当前房间，并通知酒店运营团队。",
  "guest.emergency.submit": "呼叫 112",
  "guest.emergency.submitting": "正在发送...",
  "guest.emergency.success":
    "已记录事件 #{incidentId} 的呼叫 #{callId}。当前紧急程度：{severity}。",
  "guest.emergency.retry": "重试",
  "guest.emergency.contactHotel": "联系前台",
};

const ko: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "현재 해당 객실의 활성 투숙 정보가 없습니다. 프런트에 문의하여 이용 권한을 확인해 주세요.",
  "errors.business.QR_EXPIRED":
    "QR 코드가 만료되었습니다. 새 QR 코드를 스캔하거나 프런트에 문의해 주세요.",
  "errors.business.QR_REVOKED":
    "해당 QR 코드는 더 이상 유효하지 않습니다. 프런트에서 새 코드를 발급받으세요.",
  "errors.business.ACCESS_CLOSED":
    "현재 이 객실에서는 서비스를 이용할 수 없습니다. 프런트에 문의해 주세요.",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "객실 최대 접속 기기 수에 도달했습니다. 기존 기기를 사용하거나 프런트에 문의해 주세요.",
  "errors.business.VALIDATION_FAILED":
    "입력 정보가 올바르지 않습니다. 확인 후 다시 시도해 주세요.",
  "errors.http.400": "잘못된 요청입니다. 정보를 확인한 후 다시 시도해 주세요.",
  "errors.http.401": "세션이 만료되었습니다. QR 코드를 다시 스캔해 주세요.",
  "errors.http.403": "이 작업을 수행할 권한이 없습니다. 도움이 필요하면 프런트에 문의해 주세요.",
  "errors.http.404": "요청한 데이터를 찾을 수 없습니다. 다시 시도하거나 프런트에 문의하세요.",
  "errors.http.409": "데이터가 변경되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요.",
  "errors.http.422": "입력 정보가 올바르지 않습니다. 확인 후 다시 시도해 주세요.",
  "errors.http.429": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "errors.http.500": "문제가 발생했습니다. 잠시 후 다시 시도하거나 프런트에 문의해 주세요.",
  "errors.http.default": "요청을 처리할 수 없습니다. 다시 시도하거나 프런트에 문의하세요.",
  "errors.network": "서버에 연결할 수 없습니다. 인터넷 연결을 확인한 후 다시 시도해 주세요.",
  "errors.server": "문제가 발생했습니다. 잠시 후 다시 시도하거나 프런트에 문의해 주세요.",
  "guest.emergency.eyebrow": "긴급",
  "guest.emergency.title": "긴급 지원 요청",
  "guest.emergency.description":
    "시스템이 각 통화를 개별 기록하고 현재 객실과 연동하여 호텔 운영팀에 알립니다.",
  "guest.emergency.submit": "112 호출",
  "guest.emergency.submitting": "전송 중...",
  "guest.emergency.success":
    "사고 #{incidentId} 관련 통화 #{callId}가 등록되었습니다. 현재 긴급도: {severity}.",
  "guest.emergency.retry": "다시 시도",
  "guest.emergency.contactHotel": "프런트 문의",
};

const ru: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "В настоящее время для этого номера нет активного проживания. Пожалуйста, обратитесь на ресепшен для активации доступа.",
  "errors.business.QR_EXPIRED":
    "Срок действия QR-кода истек. Отсканируйте новый QR-код или обратитесь на ресепшен.",
  "errors.business.QR_REVOKED":
    "Этот QR-код больше недействителен. Обратитесь на ресепшен для получения нового кода.",
  "errors.business.ACCESS_CLOSED":
    "Сервис в данный момент недоступен для этого номера. Обратитесь на ресепшен за помощью.",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "Достигнуто максимальное количество подключенных устройств для номера. Используйте уже вошедшее устройство или обратитесь на ресепшен.",
  "errors.business.VALIDATION_FAILED":
    "Отправленные данные некорректны. Проверьте информацию и повторите попытку.",
  "errors.http.400": "Некорректный запрос. Проверьте данные и повторите попытку.",
  "errors.http.401": "Сессия истекла. Пожалуйста, отсканируйте QR-код заново.",
  "errors.http.403": "У вас нет прав для выполнения этого действия. Обратитесь на ресепшен при необходимости.",
  "errors.http.404": "Запрошенные данные не найдены. Повторите попытку или обратитесь на ресепшен.",
  "errors.http.409": "Данные изменились. Пожалуйста, обновите страницу и попробуйте снова.",
  "errors.http.422": "Отправленные данные некорректны. Проверьте информацию и повторите попытку.",
  "errors.http.429": "Система получает слишком много запросов. Подождите немного и повторите попытку.",
  "errors.http.500": "Произошла ошибка. Попробуйте позже или обратитесь на ресепшен за помощью.",
  "errors.http.default": "Не удалось обработать запрос. Попробуйте снова или обратитесь на ресепшен.",
  "errors.network": "Не удается подключиться к серверу. Проверьте подключение к интернету и повторите попытку.",
  "errors.server": "Произошла ошибка. Попробуйте позже или обратитесь на ресепшен за помощью.",
  "guest.emergency.eyebrow": "Экстренная помощь",
  "guest.emergency.title": "Экстренный вызов",
  "guest.emergency.description":
    "Система зафиксирует вызов, привяжет его к вашему номеру и уведомит службу отеля.",
  "guest.emergency.submit": "Позвонить 112",
  "guest.emergency.submitting": "Отправка...",
  "guest.emergency.success":
    "Зарегистрирован вызов #{callId} по происшествию #{incidentId}. Текущий уровень: {severity}.",
  "guest.emergency.retry": "Повторить",
  "guest.emergency.contactHotel": "Связаться с ресепшен",
};

const hi: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "वर्तमान में इस कमरे के लिए कोई सक्रिय प्रवास नहीं है। कृपया एक्सेस के लिए रिसेप्शन से संपर्क करें।",
  "errors.business.QR_EXPIRED":
    "इस QR कोड की वैधता समाप्त हो गई है। कृपया नया QR कोड स्कैन करें या रिसेप्शन से संपर्क करें।",
  "errors.business.QR_REVOKED":
    "यह QR कोड अब मान्य नहीं है। कृपया नया कोड प्राप्त करने के लिए रिसेप्शन से संपर्क करें।",
  "errors.business.ACCESS_CLOSED":
    "इस कमरे के लिए सेवा वर्तमान में उपलब्ध नहीं है। सहायता के लिए रिसेप्शन से संपर्क करें।",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "यह कमरा कनेक्टेड डिवाइसों की अधिकतम सीमा तक पहुँच गया है। कृपया पहले से लॉगिन डिवाइस का उपयोग करें या रिसेप्शन से संपर्क करें।",
  "errors.business.VALIDATION_FAILED":
    "सबमिट की गई जानकारी अमान्य है। कृपया जाँचें और पुन: प्रयास करें।",
  "errors.http.400": "अमान्य अनुरोध। कृपया जानकारी जाँचें और पुन: प्रयास करें।",
  "errors.http.401": "आपका सत्र समाप्त हो गया है। कृपया QR कोड फिर से स्कैन करें।",
  "errors.http.403": "आपके पास यह कार्रवाई करने की अनुमति नहीं है। सहायता के लिए रिसेप्शन से संपर्क करें।",
  "errors.http.404": "अनुरोधित डेटा नहीं मिला। कृपया पुन: प्रयास करें या रिसेप्शन से संपर्क करें।",
  "errors.http.409": "डेटा बदल गया है। कृपया पेज रीफ़्रेश करें और पुन: प्रयास करें।",
  "errors.http.422": "सबमिट की गई जानकारी अमान्य है। कृपया जाँचें और पुन: प्रयास करें।",
  "errors.http.429": "सिस्टम को बहुत अधिक अनुरोध मिल रहे हैं। कृपया कुछ देर प्रतीक्षा करें और पुन: प्रयास करें।",
  "errors.http.500": "कोई त्रुटि हुई। कृपया बाद में प्रयास करें या तत्काल सहायता के लिए रिसेप्शन से संपर्क करें।",
  "errors.http.default": "अनुरोध प्रोसेस नहीं किया जा सका। कृपया पुन: प्रयास करें या रिसेप्शन से संपर्क करें।",
  "errors.network": "सर्वर से कनेक्ट नहीं हो सका। कृपया इंटरनेट कनेक्शन जांचें और पुन: प्रयास करें।",
  "errors.server": "कोई त्रुटि हुई। कृपया बाद में प्रयास करें या तत्काल सहायता के लिए रिसेप्शन से संपर्क करें।",
  "guest.emergency.eyebrow": "आपातकालीन",
  "guest.emergency.title": "आपातकालीन सहायता कॉल",
  "guest.emergency.description":
    "सिस्टम प्रत्येक कॉल को अलग से रिकॉर्ड करेगा, आपके कमरे से जोड़ेगा और होटल टीम को सूचित करेगा।",
  "guest.emergency.submit": "112 पर कॉल करें",
  "guest.emergency.submitting": "भेजा जा रहा है...",
  "guest.emergency.success":
    "घटना #{incidentId} में कॉल #{callId} दर्ज की गई। वर्तमान गंभीरता: {severity}।",
  "guest.emergency.retry": "पुन: प्रयास करें",
  "guest.emergency.contactHotel": "रिसेप्शन से संपर्क करें",
};

const dictionaries: Record<Locale, TranslationDictionary> = { vi, en, zh, ko, ru, hi };

export function translate(
  key: TranslationKey,
  values: TranslationValues = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE] ?? vi;
  const template = dictionary[key] ?? dictionaries[DEFAULT_LOCALE]?.[key] ?? vi[key] ?? "";
  return template.replace(/\{(\w+)\}/g, (_, valueKey: string) => String(values[valueKey] ?? ""));
}
