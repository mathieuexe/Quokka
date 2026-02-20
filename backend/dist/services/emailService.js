import { Resend } from "resend";
import { env } from "../config/env.js";
const resend = new Resend(env.RESEND_API_KEY);
export async function sendEmail(template) {
    try {
        console.log(`Attempting to send email to: ${template.to}`);
        console.log(`Subject: ${template.subject}`);
        // Try to send with the configured domain first
        try {
            const result = await resend.emails.send({
                from: "Quokka <noreply@quokka.gg>",
                to: template.to,
                subject: template.subject,
                text: template.text
            });
            console.log(`Email sent successfully with quokka.gg domain. ID: ${result.data?.id}`);
        }
        catch (domainError) {
            console.error(`Error with quokka.gg domain:`, domainError.message);
            // If domain verification fails, fall back to resend.dev domain
            if (domainError?.message?.includes('domain') || domainError?.statusCode === 403 || domainError?.status === 403) {
                console.warn("Domain quokka.gg not verified, falling back to resend.dev");
                try {
                    const fallbackResult = await resend.emails.send({
                        from: "Quokka <onboarding@resend.dev>",
                        to: template.to,
                        subject: template.subject,
                        text: template.text
                    });
                    console.log(`Email sent successfully with resend.dev domain. ID: ${fallbackResult.data?.id}`);
                }
                catch (fallbackError) {
                    console.error(`Error with resend.dev domain:`, fallbackError.message);
                    throw fallbackError;
                }
            }
            else {
                throw domainError;
            }
        }
    }
    catch (error) {
        console.error("Erreur lors de l'envoi de l'email:", error.message || error);
        throw new Error(`Impossible d'envoyer l'email: ${error.message || 'Erreur inconnue'}`);
    }
}
export function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
const translations = {
    fr: {
        subject: "Vérifiez votre adresse email - Quokka",
        title: "VÉRIFICATION EMAIL",
        greeting: "Bonjour",
        message: "Voici votre code de vérification :",
        expiryNote: "Ce code expire dans 10 minutes.",
        footer: "© ${year} Quokka - Tous droits réservés"
    },
    en: {
        subject: "Verify your email address - Quokka",
        title: "EMAIL VERIFICATION",
        greeting: "Hello",
        message: "Here is your verification code:",
        expiryNote: "This code expires in 10 minutes.",
        footer: "© ${year} Quokka - All rights reserved"
    },
    es: {
        subject: "Verifica tu dirección de correo - Quokka",
        title: "VERIFICACIÓN DE CORREO",
        greeting: "Hola",
        message: "Aquí está tu código de verificación:",
        expiryNote: "Este código caduca en 10 minutos.",
        footer: "© ${year} Quokka - Todos los derechos reservados"
    },
    de: {
        subject: "Bestätigen Sie Ihre E-Mail-Adresse - Quokka",
        title: "E-MAIL-BESTÄTIGUNG",
        greeting: "Hallo",
        message: "Hier ist Ihr Bestätigungscode:",
        expiryNote: "Dieser Code läuft in 10 Minuten ab.",
        footer: "© ${year} Quokka - Alle Rechte vorbehalten"
    },
    it: {
        subject: "Verifica il tuo indirizzo email - Quokka",
        title: "VERIFICA EMAIL",
        greeting: "Ciao",
        message: "Ecco il tuo codice di verifica:",
        expiryNote: "Questo codice scade tra 10 minuti.",
        footer: "© ${year} Quokka - Tutti i diritti riservati"
    },
    pt: {
        subject: "Verifique seu endereço de email - Quokka",
        title: "VERIFICAÇÃO DE EMAIL",
        greeting: "Olá",
        message: "Aqui está seu código de verificação:",
        expiryNote: "Este código expira em 10 minutos.",
        footer: "© ${year} Quokka - Todos os direitos reservados"
    },
    zh: {
        subject: "验证您的电子邮件地址 - Quokka",
        title: "电子邮件验证",
        greeting: "您好",
        message: "这是您的验证码：",
        expiryNote: "此代码将在10分钟后过期。",
        footer: "© ${year} Quokka - 保留所有权利"
    },
    ja: {
        subject: "メールアドレスを認証 - Quokka",
        title: "メール認証",
        greeting: "こんにちは",
        message: "認証コードは以下の通りです：",
        expiryNote: "このコードは10分後に期限切れになります。",
        footer: "© ${year} Quokka - 無断複写・転載を禁じます"
    },
    hi: {
        subject: "अपना ईमेल पता सत्यापित करें - Quokka",
        title: "ईमेल सत्यापन",
        greeting: "नमस्ते",
        message: "यहाँ आपका सत्यापन कोड है:",
        expiryNote: "यह कोड 10 मिनट में समाप्त हो जाएगा।",
        footer: "© ${year} Quokka - सर्वाधिकार सुरक्षित"
    },
    ru: {
        subject: "Подтвердите ваш email адрес - Quokka",
        title: "ПОДТВЕРЖДЕНИЕ EMAIL",
        greeting: "Здравствуйте",
        message: "Вот ваш код подтверждения:",
        expiryNote: "Этот код истекает через 10 минут.",
        footer: "© ${year} Quokka - Все права защищены"
    },
    uk: {
        subject: "Підтвердіть вашу email адресу - Quokka",
        title: "ПІДТВЕРДЖЕННЯ EMAIL",
        greeting: "Вітаємо",
        message: "Ось ваш код підтвердження:",
        expiryNote: "Цей код закінчується через 10 хвилин.",
        footer: "© ${year} Quokka - Всі права захищені"
    }
};
const translations2FA = {
    fr: {
        subject: "Code de connexion - Quokka",
        title: "CODE DE CONNEXION",
        greeting: "Bonjour",
        message: "Voici votre code de vérification :",
        expiryNote: "Ce code expire dans 10 minutes.",
        footer: "© ${year} Quokka - Tous droits réservés"
    },
    en: {
        subject: "Login code - Quokka",
        title: "LOGIN CODE",
        greeting: "Hello",
        message: "Here is your verification code:",
        expiryNote: "This code expires in 10 minutes.",
        footer: "© ${year} Quokka - All rights reserved"
    },
    es: {
        subject: "Código de inicio de sesión - Quokka",
        title: "CÓDIGO DE INICIO DE SESIÓN",
        greeting: "Hola",
        message: "Aquí está tu código de verificación:",
        expiryNote: "Este código caduca en 10 minutos.",
        footer: "© ${year} Quokka - Todos los derechos reservados"
    },
    de: {
        subject: "Anmeldecode - Quokka",
        title: "ANMELDECODE",
        greeting: "Hallo",
        message: "Hier ist Ihr Bestätigungscode:",
        expiryNote: "Dieser Code läuft in 10 Minuten ab.",
        footer: "© ${year} Quokka - Alle Rechte vorbehalten"
    },
    it: {
        subject: "Codice di accesso - Quokka",
        title: "CODICE DI ACCESSO",
        greeting: "Ciao",
        message: "Ecco il tuo codice di verifica:",
        expiryNote: "Questo codice scade tra 10 minuti.",
        footer: "© ${year} Quokka - Tutti i diritti riservati"
    },
    pt: {
        subject: "Código de login - Quokka",
        title: "CÓDIGO DE LOGIN",
        greeting: "Olá",
        message: "Aqui está seu código de verificação:",
        expiryNote: "Este código expira em 10 minutos.",
        footer: "© ${year} Quokka - Todos os direitos reservados"
    },
    zh: {
        subject: "登录代码 - Quokka",
        title: "登录代码",
        greeting: "您好",
        message: "这是您的验证码：",
        expiryNote: "此代码将在10分钟后过期。",
        footer: "© ${year} Quokka - 保留所有权利"
    },
    ja: {
        subject: "ログインコード - Quokka",
        title: "ログインコード",
        greeting: "こんにちは",
        message: "認証コードは以下の通りです：",
        expiryNote: "このコードは10分後に期限切れになります。",
        footer: "© ${year} Quokka - 無断複写・転載を禁じます"
    },
    hi: {
        subject: "लॉगिन कोड - Quokka",
        title: "लॉगिन कोड",
        greeting: "नमस्ते",
        message: "यहाँ आपका सत्यापन कोड है:",
        expiryNote: "यह कोड 10 मिनट में समाप्त हो जाएगा।",
        footer: "© ${year} Quokka - सर्वाधिकार सुरक्षित"
    },
    ru: {
        subject: "Код входа - Quokka",
        title: "КОД ВХОДА",
        greeting: "Здравствуйте",
        message: "Вот ваш код подтверждения:",
        expiryNote: "Этот код истекает через 10 минут.",
        footer: "© ${year} Quokka - Все права защищены"
    },
    uk: {
        subject: "Код входу - Quokka",
        title: "КОД ВХОДУ",
        greeting: "Вітаємо",
        message: "Ось ваш код підтвердження:",
        expiryNote: "Цей код закінчується через 10 хвилин.",
        footer: "© ${year} Quokka - Всі права захищені"
    }
};
const security2FA = {
    fr: "SÉCURITÉ : Ne partagez jamais ce code. Si vous n'êtes pas à l'origine de cette connexion, changez immédiatement votre mot de passe.",
    en: "SECURITY: Never share this code. If you didn't initiate this login, change your password immediately.",
    es: "SEGURIDAD: Nunca compartas este código. Si no iniciaste esta conexión, cambia tu contraseña inmediatamente.",
    de: "SICHERHEIT: Teilen Sie diesen Code niemals. Wenn Sie diese Anmeldung nicht initiiert haben, ändern Sie sofort Ihr Passwort.",
    it: "SICUREZZA: Non condividere mai questo codice. Se non hai avviato questo accesso, cambia immediatamente la password.",
    pt: "SEGURANÇA: Nunca compartilhe este código. Se você não iniciou este login, mude sua senha imediatamente.",
    zh: "安全提示：切勿分享此代码。如果您未发起此登录，请立即更改密码。",
    ja: "セキュリティ：このコードを共有しないでください。このログインを開始していない場合は、すぐにパスワードを変更してください。",
    hi: "सुरक्षा: इस कोड को कभी साझा न करें। यदि आपने इस लॉगिन को शुरू नहीं किया है, तो तुरंत अपना पासवर्ड बदलें।",
    ru: "БЕЗОПАСНОСТЬ: Никогда не делитесь этим кодом. Если вы не инициировали этот вход, немедленно смените пароль.",
    uk: "БЕЗПЕКА: Ніколи не діліться цим кодом. Якщо ви не ініціювали цей вхід, негайно змініть пароль."
};
function getTranslation(lang) {
    return translations[lang] || translations.fr;
}
function get2FATranslation(lang) {
    return translations2FA[lang] || translations2FA.fr;
}
function get2FASecurityMessage(lang) {
    return security2FA[lang] || security2FA.fr;
}
export function generateVerificationEmailTemplate(pseudo, code, language = "fr") {
    const t = getTranslation(language);
    const year = new Date().getFullYear();
    return {
        to: "",
        subject: t.subject,
        text: `
═══════════════════════════════════════════════════
${t.title}
═══════════════════════════════════════════════════

${t.greeting} ${pseudo},

${t.message}

    ${code}

${t.expiryNote}

---

${t.footer.replace("${year}", year.toString())}
    `.trim()
    };
}
export function generate2FAEmailTemplate(pseudo, code, language = "fr") {
    const t = get2FATranslation(language);
    const securityMsg = get2FASecurityMessage(language);
    const year = new Date().getFullYear();
    return {
        to: "",
        subject: t.subject,
        text: `
═══════════════════════════════════════════════════
${t.title}
═══════════════════════════════════════════════════

${t.greeting} ${pseudo},

${t.message}

    ${code}

${t.expiryNote}

⚠️  ${securityMsg}

---

${t.footer.replace("${year}", year.toString())}
    `.trim()
    };
}
