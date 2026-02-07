import { createContext, useContext } from "react";
import { Social } from "../integrations/fastdata";
import { Constants } from "./use-fastdata-constants";

const client = new Social({
  apiUrl: Constants.API_BASE_URL,
  contractId: Constants.KV_CONTRACT_ID,
});

const ClientContext = createContext<Social>(client);

export const ClientProvider = ClientContext.Provider;

export function useClient(): Social {
  return useContext(ClientContext);
}

export { client };
