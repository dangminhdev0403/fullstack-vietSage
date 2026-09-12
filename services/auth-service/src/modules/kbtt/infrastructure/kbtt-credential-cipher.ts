import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { kbttCredentialsSchema, type KbttCredentials } from "../domain/schemas/kbtt.schema";
import { kbttUnavailable, loadKbttConfig } from "./kbtt.config";

export interface EncryptedKbttCredentials {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

@Injectable()
export class KbttCredentialCipher {
  private readonly config = loadKbttConfig();

  assertReady() {
    if (!this.config.KBTT_CREDENTIAL_ENCRYPTION_KEY) throw kbttUnavailable();
  }

  encrypt(hotelId: string, credentials: KbttCredentials): EncryptedKbttCredentials {
    this.assertReady();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(Buffer.from(hotelId));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: 1,
    };
  }

  decrypt(hotelId: string, encrypted: EncryptedKbttCredentials): KbttCredentials {
    try {
      if (encrypted.keyVersion !== 1) throw kbttUnavailable();
      if (Buffer.from(encrypted.iv, "base64").length !== 12) throw kbttUnavailable();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(encrypted.iv, "base64"),
        { authTagLength: 16 },
      );
      decipher.setAAD(Buffer.from(hotelId));
      decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]);
      return kbttCredentialsSchema.parse(JSON.parse(plaintext.toString("utf8")));
    } catch {
      throw kbttUnavailable();
    }
  }

  private key() {
    this.assertReady();
    return Buffer.from(this.config.KBTT_CREDENTIAL_ENCRYPTION_KEY!, "base64");
  }
}
