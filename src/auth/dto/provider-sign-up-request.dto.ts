enum AccountType {
  PowerBusiness = 'powerBusiness',
  Nation = 'nation',
  LocalGovernment = 'localGovernment',
}

export type ProviderSignUpRequestDto = {
  id: string;
  password: string;
  accountName: string;
  accountType: AccountType;
  representativeName: string;
  representativePhone: string;
  address: string;
};
