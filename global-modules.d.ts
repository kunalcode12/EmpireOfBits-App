declare module 'react-native-qrcode-styled' {
  import type { ComponentType } from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';

  export interface QRCodeStyledProps {
    data?: string;
    pieceSize?: number;
    padding?: number;
    color?: string;
    style?: StyleProp<ViewStyle>;
    [key: string]: unknown;
  }

  const QRCodeStyled: ComponentType<QRCodeStyledProps>;
  export default QRCodeStyled;
}
